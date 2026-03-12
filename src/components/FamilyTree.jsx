import { useMemo, useEffect } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  BackgroundVariant,
} from 'reactflow'
import 'reactflow/dist/style.css'
import PersonNode from './PersonNode.jsx'
import './FamilyTree.css'

const NODE_W = 200
const NODE_H = 72
const H_GAP = 40       // gap horizontal entre nós numa geração
const V_GAP = 120      // gap vertical entre gerações
const COUPLE_GAP = 16  // gap entre cônjuges

const nodeTypes = { personNode: PersonNode }

const GEN_COLORS = ['#3b5bdb', '#0ca678', '#e67700', '#ae3ec9']

// ─── Algoritmo de layout hierárquico ──────────────────────────────
//
// 1. Calcula geração de cada pessoa
// 2. Identifica "unidades familiares": um casal (ou pessoa só) + seus filhos
// 3. Posiciona recursivamente: cada unidade ocupa uma faixa de X
//    centrada sobre os filhos
//
function buildHierarchicalLayout(people) {
  const byId = new Map(people.map((p) => [p.id, p]))

  // ── 1. Geração ──────────────────────────────────────────────────
  const gen = new Map()
  people.forEach((p) => gen.set(p.id, p.pai == null && p.mae == null ? 0 : -1))

  let changed = true
  while (changed) {
    changed = false
    people.forEach((p) => {
      if (gen.get(p.id) >= 0) return
      const gp = p.pai != null ? gen.get(p.pai) : 0
      const gm = p.mae != null ? gen.get(p.mae) : 0
      if (p.pai != null && gp < 0) return
      if (p.mae != null && gm < 0) return
      gen.set(p.id, 1 + Math.max(gp ?? 0, gm ?? 0))
      changed = true
    })
  }
  people.forEach((p) => { if (gen.get(p.id) < 0) gen.set(p.id, 0) })

  // ── 2. Identificar raízes (sem pai nem mãe cadastrados) ─────────
  const roots = people.filter((p) => !p.pai && !p.mae)

  // ── 3. Cônjuge canônico: garante que só um lado representa o casal
  //       (quem tiver o id menor alfabeticamente é o "primário")
  const coupleLeader = new Map() // id → id do líder do casal
  people.forEach((p) => {
    if (p.conjuge && byId.has(p.conjuge)) {
      const leader = p.id < p.conjuge ? p.id : p.conjuge
      coupleLeader.set(p.id, leader)
      coupleLeader.set(p.conjuge, leader)
    }
  })

  // ── 4. Conjunto de filhos já posicionados ───────────────────────
  const positioned = new Map() // id → {x, y}

  // ── Função recursiva de posicionamento ─────────────────────────
  // Retorna a largura total ocupada pela subárvore
  function placeSubtree(personId, visited = new Set()) {
    if (visited.has(personId)) return 0
    visited.add(personId)

    const person = byId.get(personId)
    if (!person) return 0

    // Cônjuge (se houver)
    const conjugeId = person.conjuge && byId.has(person.conjuge) ? person.conjuge : null

    // Filhos: união dos filhos de ambos do casal
    const myChildren = (person.filhos || []).filter((id) => byId.has(id))
    const conjugeChildren = conjugeId
      ? (byId.get(conjugeId).filhos || []).filter((id) => byId.has(id))
      : []
    const childrenIds = [...new Set([...myChildren, ...conjugeChildren])]

    // Calcula largura e posições dos filhos primeiro (bottom-up)
    let totalChildWidth = 0
    const childWidths = []
    const childSubtrees = childrenIds.map((cid) => {
      if (visited.has(cid)) {
        childWidths.push(NODE_W)
        totalChildWidth += NODE_W + H_GAP
        return NODE_W
      }
      const w = placeSubtree(cid, new Set(visited))
      childWidths.push(w)
      totalChildWidth += w + H_GAP
      return w
    })
    if (totalChildWidth > 0) totalChildWidth -= H_GAP

    // Largura do casal
    const coupleW = conjugeId ? NODE_W * 2 + COUPLE_GAP : NODE_W

    // Largura total desta subárvore
    const subtreeW = Math.max(coupleW, totalChildWidth)

    // Posiciona os pais centrados sobre os filhos
    const centerX = 0 // será ajustado pelo chamador
    const myGen = gen.get(personId) ?? 0
    const y = myGen * (NODE_H + V_GAP)

    // Posição do casal
    const coupleStartX = centerX - coupleW / 2
    positioned.set(personId, { x: coupleStartX, y })
    if (conjugeId && !positioned.has(conjugeId)) {
      positioned.set(conjugeId, { x: coupleStartX + NODE_W + COUPLE_GAP, y })
      visited.add(conjugeId)
    }

    // Posiciona filhos centralizados abaixo
    if (childrenIds.length > 0) {
      let childX = centerX - totalChildWidth / 2
      childrenIds.forEach((cid, i) => {
        if (visited.has(cid) && positioned.has(cid)) {
          // já posicionado — apenas desloca X
          const pos = positioned.get(cid)
          positioned.set(cid, { x: childX + childWidths[i] / 2 - NODE_W / 2, y: pos.y })
          childX += childWidths[i] + H_GAP
          return
        }
        visited.add(cid)
        placeSubtreeAt(cid, childX + childWidths[i] / 2, new Set(visited))
        childX += childWidths[i] + H_GAP
      })
    }

    return subtreeW
  }

  // Planta a subárvore com centro X definido
  function placeSubtreeAt(personId, centerX, visited = new Set()) {
    if (visited.has(personId)) return 0
    visited.add(personId)

    const person = byId.get(personId)
    if (!person) return 0

    const conjugeId = person.conjuge && byId.has(person.conjuge) ? person.conjuge : null
    const myChildren = (person.filhos || []).filter((id) => byId.has(id))
    const conjugeChildren = conjugeId
      ? (byId.get(conjugeId).filhos || []).filter((id) => byId.has(id))
      : []
    const childrenIds = [...new Set([...myChildren, ...conjugeChildren])]

    let totalChildWidth = 0
    const childWidths = childrenIds.map((cid) => {
      const w = estimateSubtreeWidth(cid, byId, new Set(visited))
      totalChildWidth += w + H_GAP
      return w
    })
    if (totalChildWidth > 0) totalChildWidth -= H_GAP

    const coupleW = conjugeId ? NODE_W * 2 + COUPLE_GAP : NODE_W
    const subtreeW = Math.max(coupleW, totalChildWidth)

    const myGen = gen.get(personId) ?? 0
    const y = myGen * (NODE_H + V_GAP)

    const coupleStartX = centerX - coupleW / 2
    if (!positioned.has(personId)) positioned.set(personId, { x: coupleStartX, y })
    if (conjugeId && !positioned.has(conjugeId)) {
      positioned.set(conjugeId, { x: coupleStartX + NODE_W + COUPLE_GAP, y })
      visited.add(conjugeId)
    }

    if (childrenIds.length > 0) {
      let childX = centerX - totalChildWidth / 2
      childrenIds.forEach((cid, i) => {
        if (!visited.has(cid)) {
          placeSubtreeAt(cid, childX + childWidths[i] / 2, new Set(visited))
        }
        childX += childWidths[i] + H_GAP
      })
    }

    return subtreeW
  }

  // Estimativa de largura sem posicionar (para pré-cálculo)
  function estimateSubtreeWidth(personId, byId, visited) {
    if (visited.has(personId)) return NODE_W
    visited.add(personId)
    const person = byId.get(personId)
    if (!person) return NODE_W

    const conjugeId = person.conjuge && byId.has(person.conjuge) ? person.conjuge : null
    const myChildren = (person.filhos || []).filter((id) => byId.has(id))
    const conjugeChildren = conjugeId
      ? (byId.get(conjugeId).filhos || []).filter((id) => byId.has(id))
      : []
    const childrenIds = [...new Set([...myChildren, ...conjugeChildren])]

    let totalChildWidth = 0
    childrenIds.forEach((cid) => {
      totalChildWidth += estimateSubtreeWidth(cid, byId, new Set(visited)) + H_GAP
    })
    if (totalChildWidth > 0) totalChildWidth -= H_GAP

    const coupleW = conjugeId ? NODE_W * 2 + COUPLE_GAP : NODE_W
    return Math.max(coupleW, totalChildWidth)
  }

  // ── 5. Posiciona cada raiz lado a lado ──────────────────────────
  const rootWidths = roots.map((r) => estimateSubtreeWidth(r.id, byId, new Set()))
  let totalRootW = rootWidths.reduce((s, w) => s + w + H_GAP * 3, 0)
  if (totalRootW > 0) totalRootW -= H_GAP * 3

  let curX = -totalRootW / 2
  roots.forEach((r, i) => {
    const w = rootWidths[i]
    placeSubtreeAt(r.id, curX + w / 2, new Set())
    curX += w + H_GAP * 3
  })

  // Posiciona qualquer pessoa que ficou de fora (sem pai/mãe mas não está em raízes)
  people.forEach((p) => {
    if (!positioned.has(p.id)) {
      const g = gen.get(p.id) ?? 0
      positioned.set(p.id, { x: curX, y: g * (NODE_H + V_GAP) })
      curX += NODE_W + H_GAP
    }
  })

  return { positions: positioned, genMap: gen }
}

// ─── Componente ───────────────────────────────────────────────────
function FamilyTree({ people, onNodeClick, selectedId }) {
  const { positions, genMap } = useMemo(
    () => buildHierarchicalLayout(people),
    [people]
  )

  const initialNodes = useMemo(() => {
    return people.map((p) => {
      const g = genMap.get(p.id) ?? 0
      const pos = positions.get(p.id) ?? { x: 0, y: 0 }
      return {
        id: p.id,
        type: 'personNode',
        position: pos,
        selected: p.id === selectedId,
        data: {
          id: p.id,
          nome: p.nome,
          generation: Math.min(g, 3),
          hasConjuge: !!p.conjuge,
          filhosCount: Array.isArray(p.filhos) ? p.filhos.length : 0,
          onClick: onNodeClick,
        },
      }
    })
  }, [people, positions, genMap, onNodeClick, selectedId])

  const initialEdges = useMemo(() => {
    const edges = []
    const added = new Set()

    people.forEach((p) => {
      // Aresta cônjuge (horizontal, sem seta)
      if (p.conjuge && !added.has(`c-${p.conjuge}-${p.id}`)) {
        added.add(`c-${p.id}-${p.conjuge}`)
        edges.push({
          id: `conjuge-${p.id}-${p.conjuge}`,
          source: p.id,
          target: p.conjuge,
          type: 'straight',
          style: { stroke: '#a0aec0', strokeWidth: 2, strokeDasharray: '6,3' },
        })
      }

      // Aresta pai → filho
      if (p.pai) {
        const g = genMap.get(p.id) ?? 0
        const color = GEN_COLORS[Math.min(g - 1, GEN_COLORS.length - 1)] || GEN_COLORS[0]
        edges.push({
          id: `pai-${p.id}`,
          source: p.pai,
          target: p.id,
          type: 'smoothstep',
          style: { stroke: color, strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 12, height: 12 },
        })
      }

      // Aresta mãe → filho (tracejada)
      if (p.mae) {
        const g = genMap.get(p.id) ?? 0
        const color = GEN_COLORS[Math.min(g - 1, GEN_COLORS.length - 1)] || GEN_COLORS[0]
        edges.push({
          id: `mae-${p.id}`,
          source: p.mae,
          target: p.id,
          type: 'smoothstep',
          style: { stroke: color, strokeWidth: 1.5, strokeDasharray: '5,4' },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 12, height: 12 },
        })
      }
    })
    return edges
  }, [people, genMap])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

  return (
    <div className="family-tree">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.04}
        maxZoom={2}
        nodesDraggable
        elementsSelectable
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#c8d0da" />
        <Controls
          showInteractive={false}
          style={{
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            top: 'auto',
            flexDirection: 'row',
            borderRadius: '99px',
            overflow: 'hidden',
            boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
          }}
        />
        <MiniMap
          style={{ bottom: 16, right: 16, borderRadius: 12, border: '1px solid #dde3ea' }}
          nodeColor={(n) => {
            const c = GEN_COLORS
            return c[Math.min(n.data?.generation ?? 0, c.length - 1)]
          }}
          maskColor="rgba(240,244,248,0.6)"
        />
      </ReactFlow>
    </div>
  )
}

export default FamilyTree
