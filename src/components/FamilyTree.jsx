import { useMemo, useEffect, useRef } from 'react'
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

const NODE_W     = 200
const NODE_H     = 74
const H_GAP      = 50   // gap entre irmãos
const COUPLE_GAP = 56   // gap entre cônjuges (espaço para a linha de casal respirar)
const V_GAP      = 100  // gap vertical entre gerações

const nodeTypes = { personNode: PersonNode }

// Paleta por geração — índice = geração real
const GEN_PALETTE = [
  { color: '#3b5bdb', bg: '#eef2ff', border: '#818cf8' }, // fundadores
  { color: '#0891b2', bg: '#ecfeff', border: '#22d3ee' }, // 1ª geração
  { color: '#0ca678', bg: '#ecfdf5', border: '#34d399' }, // 2ª geração
  { color: '#d97706', bg: '#fffbeb', border: '#fbbf24' }, // 3ª geração
  { color: '#7c3aed', bg: '#f5f3ff', border: '#a78bfa' }, // 4ª+
]

// ─── Layout ────────────────────────────────────────────────────────
function buildLayout(people) {
  const byId = new Map(people.map(p => [p.id, p]))

  // 1. Detecta cônjuges "externos" (sem ascendência própria)
  // Regra: pessoa sem pai e sem mãe, cujo cônjuge TEM pai ou mãe OU tem filhos registrados
  // Quando ambos são raízes sem ascendência, quem tem filhos lidera; o outro é "externo"
  const isSpouseOnly = new Set()
  people.forEach(p => {
    if (p.pai || p.mae) return          // tem ascendência → não é externo
    if (!p.conjuge) return              // sem cônjuge → raiz independente
    const conj = byId.get(p.conjuge)
    if (!conj) return

    const conjHasAscendency = conj.pai || conj.mae
    if (conjHasAscendency) {
      // cônjuge tem ascendência → p é externo
      isSpouseOnly.add(p.id)
      return
    }

    // Ambos sem ascendência: quem tiver filhos registrados lidera
    const pHasKids    = (p.filhos    || []).length > 0
    const conjHasKids = (conj.filhos || []).length > 0

    if (!pHasKids && conjHasKids) {
      // eu não tenho filhos, cônjuge tem → sou externo
      isSpouseOnly.add(p.id)
    } else if (pHasKids && !conjHasKids) {
      // eu tenho filhos, cônjuge não → cônjuge é externo (será marcado na volta)
    } else {
      // ambos têm ou nenhum tem → desempata por ordem no array (índice menor = líder)
      const pIdx    = people.findIndex(x => x.id === p.id)
      const conjIdx = people.findIndex(x => x.id === conj.id)
      if (pIdx > conjIdx) isSpouseOnly.add(p.id)
    }
  })

  // 2. Raízes
  const roots = people.filter(p => !p.pai && !p.mae && !isSpouseOnly.has(p.id))

  // 3. Geração via BFS
  const genMap = new Map()
  const queue  = []
  roots.forEach(r => { genMap.set(r.id, 0); queue.push(r.id) })
  while (queue.length) {
    const id = queue.shift()
    const p  = byId.get(id)
    if (!p) continue
    const g = genMap.get(id) ?? 0
    if (p.conjuge && !genMap.has(p.conjuge)) { genMap.set(p.conjuge, g); queue.push(p.conjuge) }
    getChildren(p, byId).forEach(cid => {
      if (!genMap.has(cid)) { genMap.set(cid, g + 1); queue.push(cid) }
    })
  }
  people.forEach(p => { if (!genMap.has(p.id)) genMap.set(p.id, 0) })

  // 4. Posicionamento recursivo
  const positions = new Map()

  function coupleWidth(id, vis) {
    const p = byId.get(id); if (!p) return NODE_W
    const cId = conjId(p, byId, isSpouseOnly)
    return cId ? NODE_W * 2 + COUPLE_GAP : NODE_W
  }

  function subtreeW(id, vis = new Set()) {
    if (vis.has(id)) return NODE_W
    vis.add(id)
    const p   = byId.get(id); if (!p) return NODE_W
    const cId = conjId(p, byId, isSpouseOnly)
    const cW  = cId ? NODE_W * 2 + COUPLE_GAP : NODE_W
    const kids = getChildren(p, byId, cId)
    if (!kids.length) return cW
    let total = kids.reduce((s, k) => s + subtreeW(k, new Set(vis)) + H_GAP, -H_GAP)
    return Math.max(cW, total)
  }

  function place(id, cx, depth, vis = new Set()) {
    if (vis.has(id)) return
    vis.add(id)
    const p = byId.get(id); if (!p) return
    const y   = depth * (NODE_H + V_GAP)
    const cId = conjId(p, byId, isSpouseOnly)
    const cW  = cId ? NODE_W * 2 + COUPLE_GAP : NODE_W
    const lx  = cx - cW / 2

    if (!positions.has(id))  positions.set(id,  { x: lx, y })
    if (cId && !positions.has(cId)) { positions.set(cId, { x: lx + NODE_W + COUPLE_GAP, y }); vis.add(cId) }

    const kids = getChildren(p, byId, cId)
    if (!kids.length) return
    const ws    = kids.map(k => subtreeW(k, new Set(vis)))
    const total = ws.reduce((s, w) => s + w + H_GAP, -H_GAP)
    let cx2     = cx - total / 2
    kids.forEach((k, i) => {
      if (!vis.has(k)) place(k, cx2 + ws[i] / 2, depth + 1, new Set(vis))
      cx2 += ws[i] + H_GAP
    })
  }

  const rw    = roots.map(r => subtreeW(r.id, new Set()))
  const total = rw.reduce((s, w) => s + w + H_GAP * 6, -H_GAP * 6)
  let cx      = -total / 2
  roots.forEach((r, i) => { place(r.id, cx + rw[i] / 2, 0); cx += rw[i] + H_GAP * 6 })

  // Qualquer não alcançado
  let fallX = cx + H_GAP
  people.forEach(p => {
    if (!positions.has(p.id)) {
      positions.set(p.id, { x: fallX, y: (genMap.get(p.id) ?? 0) * (NODE_H + V_GAP) })
      fallX += NODE_W + H_GAP
    }
  })

  return { positions, genMap, isSpouseOnly }
}

function conjId(p, byId, isSpouseOnly) {
  if (!p.conjuge || !byId.has(p.conjuge)) return null
  // Se o cônjuge é externo → eu sou o líder, retorno o cônjuge
  if (isSpouseOnly.has(p.conjuge)) return p.conjuge
  // Se eu sou o externo → sou posicionado pelo meu cônjuge, não lidero
  if (isSpouseOnly.has(p.id)) return null
  // Ambos são raízes normais — não devo duplicar o par, então só o líder retorna
  // O líder já foi definido pelo isSpouseOnly: se nenhum dos dois é externo aqui,
  // significa que ambos são raízes independentes (sem cônjuge válido) — não renderiza par
  return null
}

function getChildren(p, byId, cId = null) {
  const s = new Set()
  ;(p.filhos || []).forEach(id => { if (byId.has(id)) s.add(id) })
  if (cId) { const c = byId.get(cId); (c?.filhos || []).forEach(id => { if (byId.has(id)) s.add(id) }) }
  return [...s]
}

// ─── Inner component ──────────────────────────────────────────────
function FamilyTreeInner({ people, onNodeClick, selectedId, focusPersonId, zoomToId }) {
  const { setCenter, fitView } = useReactFlow()
  const byId = useMemo(() => new Map(people.map(p => [p.id, p])), [people])
  const { positions, genMap, isSpouseOnly } = useMemo(() => buildLayout(people), [people])

  // Modo foco
  const visibleIds = useMemo(() => {
    if (!focusPersonId) return null
    const p = byId.get(focusPersonId); if (!p) return null
    const ids = new Set([focusPersonId])
    if (p.pai)    ids.add(p.pai)
    if (p.mae)    ids.add(p.mae)
    if (p.conjuge) ids.add(p.conjuge)
    ;(p.filhos || []).forEach(id => ids.add(id))
    if (p.pai) { const pp = byId.get(p.pai); if (pp) { if (pp.conjuge) ids.add(pp.conjuge); if (pp.pai) ids.add(pp.pai); if (pp.mae) ids.add(pp.mae) } }
    if (p.mae) { const mm = byId.get(p.mae); if (mm) { if (mm.conjuge) ids.add(mm.conjuge); if (mm.pai) ids.add(mm.pai); if (mm.mae) ids.add(mm.mae) } }
    return ids
  }, [focusPersonId, byId])

  const initialNodes = useMemo(() => people
    .filter(p => !visibleIds || visibleIds.has(p.id))
    .map(p => {
      const rawGen = genMap.get(p.id) ?? 0
      // Cônjuge externo herda a cor/geração do parceiro
      const isExternal = isSpouseOnly.has(p.id)
      const displayGen = isExternal
        ? (genMap.get(p.conjuge) ?? rawGen)
        : rawGen

      return {
        id: p.id,
        type: 'personNode',
        position: positions.get(p.id) ?? { x: 0, y: 0 },
        selected: p.id === selectedId,
        data: {
          id: p.id,
          nome: p.nome,
          generation:  Math.min(displayGen, GEN_PALETTE.length - 1),
          isSpouseOnly: isExternal,
          hasConjuge:   !!p.conjuge,
          filhosCount:  (p.filhos || []).length,
          paiNome:      byId.get(p.pai)?.nome     ?? null,
          maeNome:      byId.get(p.mae)?.nome     ?? null,
          conjugeNome:  byId.get(p.conjuge)?.nome ?? null,
          fotoUrl:      p.foto_url ?? null,
          falecimento:  p.falecimento ?? null,
          onClick: onNodeClick,
        },
      }
    }), [people, positions, genMap, isSpouseOnly, onNodeClick, selectedId, visibleIds, byId])

  const initialEdges = useMemo(() => {
    const edges = []
    const seenCouple = new Set()

    people.forEach(p => {
      if (visibleIds && !visibleIds.has(p.id)) return

      // Linha de casal — horizontal, discreta
      if (p.conjuge && !seenCouple.has(`${p.conjuge}|${p.id}`)) {
        const cId = p.conjuge
        if (!visibleIds || visibleIds.has(cId)) {
          seenCouple.add(`${p.id}|${cId}`)
          edges.push({
            id: `couple-${p.id}-${cId}`,
            source: p.id, target: cId,
            type: 'straight',
            style: { stroke: '#cbd5e1', strokeWidth: 2.5, strokeDasharray: '4,4' },
            zIndex: 0,
          })
        }
      }

      // Linha pai → filho (sólida, colorida)
      if (p.pai && (!visibleIds || visibleIds.has(p.pai))) {
        const g     = genMap.get(p.id) ?? 0
        const pal   = GEN_PALETTE[Math.min(g, GEN_PALETTE.length - 1)]
        edges.push({
          id: `pai-${p.id}`,
          source: p.pai, target: p.id,
          type: 'smoothstep',
          style: { stroke: pal.color, strokeWidth: 2.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: pal.color, width: 14, height: 14 },
          zIndex: 1,
        })
      }

      // Linha mãe → filho (tracejada, mesma cor)
      if (p.mae && (!visibleIds || visibleIds.has(p.mae))) {
        const g   = genMap.get(p.id) ?? 0
        const pal = GEN_PALETTE[Math.min(g, GEN_PALETTE.length - 1)]
        edges.push({
          id: `mae-${p.id}`,
          source: p.mae, target: p.id,
          type: 'smoothstep',
          style: { stroke: pal.color, strokeWidth: 2, strokeDasharray: '6,4', opacity: 0.7 },
          markerEnd: { type: MarkerType.ArrowClosed, color: pal.color, width: 12, height: 12 },
          zIndex: 1,
        })
      }
    })
    return edges
  }, [people, genMap, visibleIds])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  useEffect(() => { setNodes(initialNodes) }, [initialNodes, setNodes])
  useEffect(() => { setEdges(initialEdges) }, [initialEdges, setEdges])

  useEffect(() => {
    if (!zoomToId) return
    const pos = positions.get(zoomToId); if (!pos) return
    setTimeout(() => setCenter(pos.x + NODE_W / 2, pos.y + NODE_H / 2, { zoom: 1.3, duration: 700 }), 60)
  }, [zoomToId, positions, setCenter])

  const prevFocus = useRef(null)
  useEffect(() => {
    if (focusPersonId !== prevFocus.current) {
      prevFocus.current = focusPersonId
      setTimeout(() => fitView({ padding: 0.2, duration: 500 }), 80)
    }
  }, [focusPersonId, fitView])

  return (
    <ReactFlow
      nodes={nodes} edges={edges}
      onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView fitViewOptions={{ padding: 0.12 }}
      minZoom={0.04} maxZoom={2.5}
      nodesDraggable elementsSelectable
    >
      <Background variant={BackgroundVariant.Lines} gap={32} size={1} color="#e8edf2" />
      <Controls
        showInteractive={false}
        style={{
          bottom: 16, left: '50%', transform: 'translateX(-50%)', top: 'auto',
          flexDirection: 'row', borderRadius: '99px', overflow: 'hidden',
          boxShadow: '0 2px 16px rgba(0,0,0,0.1)',
          border: '1px solid #e2e8f0',
        }}
      />
      <MiniMap
        style={{ bottom: 16, right: 16, borderRadius: 12, border: '1px solid #dde3ea' }}
        nodeColor={n => GEN_PALETTE[Math.min(n.data?.generation ?? 0, GEN_PALETTE.length - 1)].color}
        maskColor="rgba(240,244,248,0.55)"
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
