import { useMemo, useEffect, useCallback, useRef } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow'
import 'reactflow/dist/style.css'
import PersonNode from './PersonNode.jsx'
import './FamilyTree.css'

const NODE_W = 190
const NODE_H = 68
const SIBLING_GAP = 30   // gap horizontal entre irmãos / filhos
const COUPLE_GAP  = 8    // gap entre cônjuge e seu par
const LEVEL_GAP   = 140  // gap vertical entre gerações

const nodeTypes = { personNode: PersonNode }
const GEN_COLORS = ['#3b5bdb', '#0ca678', '#e67700', '#ae3ec9']

// ─────────────────────────────────────────────────────────────────
// ALGORITMO DE LAYOUT
//
// Princípios (inspirado em Ancestry / MyHeritage):
//
// 1. Cônjuges "externos" (sem pai/mãe cadastrados) NÃO são raízes
//    — ficam colados ao lado do cônjuge.
//
// 2. Cada nó da árvore representa UMA PESSOA. O par (pessoa + cônjuge)
//    é tratado como uma "unidade de casal" que ocupa largura fixa.
//
// 3. A largura de uma subárvore é max(largura_casal, soma_filhos).
//    Os filhos ficam centralizados sob o PONTO MÉDIO do casal.
//
// 4. Gerações são calculadas pela profundidade desde a raiz principal
//    (Conrado), garantindo alinhamento correto por linha.
// ─────────────────────────────────────────────────────────────────

function buildLayout(people) {
  const byId   = new Map(people.map(p => [p.id, p]))

  // ── 1. Quem é "cônjuge externo"? ──────────────────────────────
  // Pessoa sem pai e sem mãe, cujo cônjuge TEM pai ou mãe (ou é raiz principal)
  const isSpouseOnly = new Set()
  people.forEach(p => {
    if (p.pai || p.mae) return   // tem ascendência → não é cônjuge externo
    if (!p.conjuge) return        // sem cônjuge → raiz independente
    const conj = byId.get(p.conjuge)
    if (!conj) return
    // Marca o "menor ID" de cada par para não marcar os dois
    // — quem tem filhos marcados como próprios (não só pelo conjuge) fica como âncora
    const isPrimaryAnchor = (p.filhos || []).some(fid => {
      const f = byId.get(fid)
      return f && (f.pai === p.id || f.mae === p.id)
    })
    const conjHasAscendency = conj.pai || conj.mae
    if (!isPrimaryAnchor && conjHasAscendency) {
      isSpouseOnly.add(p.id)
    }
  })

  // ── 2. Raízes = sem pai, sem mãe, não são cônjuge externo ─────
  const roots = people.filter(p => !p.pai && !p.mae && !isSpouseOnly.has(p.id))

  // ── 3. Geração: BFS a partir das raízes ───────────────────────
  const genMap = new Map()
  const queue = []
  roots.forEach(r => { genMap.set(r.id, 0); queue.push(r.id) })

  // Cônjuges externos recebem a mesma geração do cônjuge
  while (queue.length) {
    const id = queue.shift()
    const p  = byId.get(id)
    if (!p) continue
    const g  = genMap.get(id) ?? 0

    // Cônjuge externo: mesma geração
    if (p.conjuge && !genMap.has(p.conjuge)) {
      genMap.set(p.conjuge, g)
      queue.push(p.conjuge)
    }

    // Filhos: geração + 1
    const childIds = getChildren(p, byId)
    childIds.forEach(cid => {
      if (!genMap.has(cid)) {
        genMap.set(cid, g + 1)
        queue.push(cid)
      }
    })
  }
  // Qualquer um que não foi alcançado
  people.forEach(p => { if (!genMap.has(p.id)) genMap.set(p.id, 0) })

  // ── 4. Posicionamento recursivo ───────────────────────────────
  const positions = new Map()
  const visited   = new Set()

  // Estima a largura total que uma sub-árvore vai ocupar
  function subtreeWidth(id, vis = new Set()) {
    if (vis.has(id)) return NODE_W
    vis.add(id)
    const p    = byId.get(id)
    if (!p) return NODE_W

    const conjId  = getConjuge(p, byId, isSpouseOnly)
    const coupleW = conjId ? NODE_W * 2 + COUPLE_GAP : NODE_W

    const children = getChildren(p, byId, conjId)
    if (!children.length) return coupleW

    let childTotal = children.reduce((acc, cid) => {
      return acc + subtreeWidth(cid, new Set(vis)) + SIBLING_GAP
    }, -SIBLING_GAP)

    return Math.max(coupleW, childTotal)
  }

  // Posiciona uma subárvore com centro horizontal em `cx`
  function place(id, cx, depth, vis = new Set()) {
    if (vis.has(id)) return
    vis.add(id)
    const p = byId.get(id)
    if (!p) return

    const y       = depth * (NODE_H + LEVEL_GAP)
    const conjId  = getConjuge(p, byId, isSpouseOnly)
    const coupleW = conjId ? NODE_W * 2 + COUPLE_GAP : NODE_W

    // Posição do par
    const leftX = cx - coupleW / 2
    if (!positions.has(id)) positions.set(id, { x: leftX, y })
    if (conjId && !positions.has(conjId)) {
      positions.set(conjId, { x: leftX + NODE_W + COUPLE_GAP, y })
      vis.add(conjId)
    }

    // Filhos
    const children = getChildren(p, byId, conjId)
    if (!children.length) return

    const widths     = children.map(cid => subtreeWidth(cid, new Set(vis)))
    const totalW     = widths.reduce((a, w) => a + w + SIBLING_GAP, -SIBLING_GAP)
    let   childCX    = cx - totalW / 2

    children.forEach((cid, i) => {
      if (!vis.has(cid)) {
        place(cid, childCX + widths[i] / 2, depth + 1, new Set(vis))
      }
      childCX += widths[i] + SIBLING_GAP
    })
  }

  // Espaça raízes horizontalmente
  const rootWidths = roots.map(r => subtreeWidth(r.id, new Set()))
  const totalRootW = rootWidths.reduce((a, w) => a + w + SIBLING_GAP * 4, -SIBLING_GAP * 4)
  let curX = -totalRootW / 2

  roots.forEach((r, i) => {
    place(r.id, curX + rootWidths[i] / 2, 0)
    curX += rootWidths[i] + SIBLING_GAP * 4
  })

  // Qualquer pessoa não alcançada
  people.forEach(p => {
    if (!positions.has(p.id)) {
      const g = genMap.get(p.id) ?? 0
      positions.set(p.id, { x: curX, y: g * (NODE_H + LEVEL_GAP) })
      curX += NODE_W + SIBLING_GAP
    }
  })

  return { positions, genMap, isSpouseOnly }
}

// ── Helpers ────────────────────────────────────────────────────────

// Retorna o cônjuge "externo" de uma pessoa (se houver)
function getConjuge(p, byId, isSpouseOnly) {
  if (!p.conjuge) return null
  const c = byId.get(p.conjuge)
  if (!c) return null
  // O cônjuge externo é o que está em isSpouseOnly
  if (isSpouseOnly.has(p.conjuge)) return p.conjuge
  // Ou se eu sou o externo, não retorno cônjuge aqui (serei posicionado pelo outro lado)
  if (isSpouseOnly.has(p.id)) return null
  // Ambos têm ascendência? Retorna o conjuge com id maior (evita duplicação)
  if (p.id < p.conjuge) return p.conjuge
  return null
}

// Retorna os filhos únicos de uma pessoa (ou do casal)
function getChildren(p, byId, conjId = null) {
  const set = new Set()
  ;(p.filhos || []).forEach(id => { if (byId.has(id)) set.add(id) })
  if (conjId) {
    const c = byId.get(conjId)
    ;(c?.filhos || []).forEach(id => { if (byId.has(id)) set.add(id) })
  }
  return [...set]
}

// ─────────────────────────────────────────────────────────────────
// COMPONENTE
// ─────────────────────────────────────────────────────────────────

function FamilyTreeInner({ people, onNodeClick, selectedId, focusPersonId, zoomToId }) {
  const { setCenter, fitView } = useReactFlow()
  const byId = useMemo(() => new Map(people.map(p => [p.id, p])), [people])

  const { positions, genMap, isSpouseOnly } = useMemo(() => buildLayout(people), [people])

  // Modo foco: mostra pessoa + família imediata + avós
  const visibleIds = useMemo(() => {
    if (!focusPersonId) return null
    const p   = byId.get(focusPersonId)
    if (!p) return null
    const ids = new Set([focusPersonId])
    if (p.pai)    ids.add(p.pai)
    if (p.mae)    ids.add(p.mae)
    if (p.conjuge) ids.add(p.conjuge)
    p.filhos?.forEach(id => ids.add(id))
    if (p.pai) { const pai = byId.get(p.pai); if (pai?.conjuge) ids.add(pai.conjuge); if (pai?.pai) ids.add(pai.pai); if (pai?.mae) ids.add(pai.mae) }
    if (p.mae) { const mae = byId.get(p.mae); if (mae?.conjuge) ids.add(mae.conjuge); if (mae?.pai) ids.add(mae.pai); if (mae?.mae) ids.add(mae.mae) }
    return ids
  }, [focusPersonId, byId])

  const initialNodes = useMemo(() => people
    .filter(p => !visibleIds || visibleIds.has(p.id))
    .map(p => {
      const g      = genMap.get(p.id) ?? 0
      const pos    = positions.get(p.id) ?? { x: 0, y: 0 }
      const pai    = p.pai    ? byId.get(p.pai)    : null
      const mae    = p.mae    ? byId.get(p.mae)    : null
      const conjuge= p.conjuge? byId.get(p.conjuge): null
      return {
        id: p.id,
        type: 'personNode',
        position: pos,
        selected: p.id === selectedId,
        data: {
          id: p.id, nome: p.nome,
          generation:   Math.min(g, 3),
          hasConjuge:   !!p.conjuge,
          filhosCount:  Array.isArray(p.filhos) ? p.filhos.length : 0,
          paiNome:      pai?.nome    ?? null,
          maeNome:      mae?.nome    ?? null,
          conjugeNome:  conjuge?.nome?? null,
          onClick: onNodeClick,
        },
      }
    }), [people, positions, genMap, onNodeClick, selectedId, visibleIds, byId])

  const initialEdges = useMemo(() => {
    const edges      = []
    const addedCouple= new Set()

    people.forEach(p => {
      if (visibleIds && !visibleIds.has(p.id)) return

      // Aresta cônjuge (linha horizontal tracejada cinza)
      if (p.conjuge && !addedCouple.has(`${p.conjuge}-${p.id}`)) {
        const conjId = p.conjuge
        if (!visibleIds || visibleIds.has(conjId)) {
          addedCouple.add(`${p.id}-${conjId}`)
          edges.push({
            id: `conjuge-${p.id}-${conjId}`,
            source: p.id, target: conjId,
            type: 'straight',
            style: { stroke: '#94a3b8', strokeWidth: 2, strokeDasharray: '6,3' },
          })
        }
      }

      // Pai → filho
      if (p.pai && (!visibleIds || visibleIds.has(p.pai))) {
        const g     = genMap.get(p.id) ?? 0
        const color = GEN_COLORS[Math.min(g - 1, GEN_COLORS.length - 1)] ?? GEN_COLORS[0]
        edges.push({
          id: `pai-${p.id}`,
          source: p.pai, target: p.id,
          type: 'smoothstep',
          style: { stroke: color, strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 12, height: 12 },
        })
      }

      // Mãe → filho (tracejada)
      if (p.mae && (!visibleIds || visibleIds.has(p.mae))) {
        const g     = genMap.get(p.id) ?? 0
        const color = GEN_COLORS[Math.min(g - 1, GEN_COLORS.length - 1)] ?? GEN_COLORS[0]
        edges.push({
          id: `mae-${p.id}`,
          source: p.mae, target: p.id,
          type: 'smoothstep',
          style: { stroke: color, strokeWidth: 1.5, strokeDasharray: '5,4' },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 12, height: 12 },
        })
      }
    })
    return edges
  }, [people, genMap, visibleIds])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => { setNodes(initialNodes) }, [initialNodes, setNodes])
  useEffect(() => { setEdges(initialEdges) }, [initialEdges, setEdges])

  // Zoom para pessoa (busca)
  useEffect(() => {
    if (!zoomToId) return
    const pos = positions.get(zoomToId)
    if (!pos) return
    setTimeout(() => setCenter(pos.x + NODE_W / 2, pos.y + NODE_H / 2, { zoom: 1.2, duration: 650 }), 60)
  }, [zoomToId, positions, setCenter])

  // fitView ao mudar modo foco
  const prevFocus = useRef(null)
  useEffect(() => {
    if (focusPersonId !== prevFocus.current) {
      prevFocus.current = focusPersonId
      setTimeout(() => fitView({ padding: 0.18, duration: 500 }), 80)
    }
  }, [focusPersonId, fitView])

  return (
    <ReactFlow
      nodes={nodes} edges={edges}
      onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView fitViewOptions={{ padding: 0.1 }}
      minZoom={0.04} maxZoom={2.5}
      nodesDraggable elementsSelectable
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#c8d0da" />
      <Controls
        showInteractive={false}
        style={{
          bottom: 16, left: '50%', transform: 'translateX(-50%)', top: 'auto',
          flexDirection: 'row', borderRadius: '99px', overflow: 'hidden',
          boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
        }}
      />
      <MiniMap
        style={{ bottom: 16, right: 16, borderRadius: 12, border: '1px solid #dde3ea' }}
        nodeColor={n => GEN_COLORS[Math.min(n.data?.generation ?? 0, GEN_COLORS.length - 1)]}
        maskColor="rgba(240,244,248,0.6)"
      />
    </ReactFlow>
  )
}

function FamilyTree(props) {
  return (
    <div className="family-tree">
      <ReactFlowProvider>
        <FamilyTreeInner {...props} />
      </ReactFlowProvider>
    </div>
  )
}

export default FamilyTree
