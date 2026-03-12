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

const NODE_W = 200
const NODE_H = 72
const H_GAP = 40
const V_GAP = 130
const COUPLE_GAP = 16

const nodeTypes = { personNode: PersonNode }
const GEN_COLORS = ['#3b5bdb', '#0ca678', '#e67700', '#ae3ec9']

// ── Algoritmo de layout ────────────────────────────────────────────
function buildHierarchicalLayout(people) {
  const byId = new Map(people.map((p) => [p.id, p]))

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

  const roots = people.filter((p) => !p.pai && !p.mae)
  const positioned = new Map()

  function estimateW(personId, visited) {
    if (visited.has(personId)) return NODE_W
    visited.add(personId)
    const p = byId.get(personId)
    if (!p) return NODE_W
    const cId = p.conjuge && byId.has(p.conjuge) ? p.conjuge : null
    const children = [...new Set([
      ...(p.filhos || []).filter((id) => byId.has(id)),
      ...(cId ? (byId.get(cId).filhos || []).filter((id) => byId.has(id)) : []),
    ])]
    let totalChild = 0
    children.forEach((c) => { totalChild += estimateW(c, byId, new Set(visited)) + H_GAP })
    if (totalChild > 0) totalChild -= H_GAP
    const coupleW = cId ? NODE_W * 2 + COUPLE_GAP : NODE_W
    return Math.max(coupleW, totalChild)
  }

  function placeAt(personId, centerX, visited = new Set()) {
    if (visited.has(personId)) return
    visited.add(personId)
    const p = byId.get(personId)
    if (!p) return
    const cId = p.conjuge && byId.has(p.conjuge) ? p.conjuge : null
    const children = [...new Set([
      ...(p.filhos || []).filter((id) => byId.has(id)),
      ...(cId ? (byId.get(cId).filhos || []).filter((id) => byId.has(id)) : []),
    ])]
    const childWidths = children.map((c) => estimateW(c, byId, new Set(visited)))
    let totalChild = childWidths.reduce((s, w) => s + w + H_GAP, 0)
    if (totalChild > 0) totalChild -= H_GAP
    const coupleW = cId ? NODE_W * 2 + COUPLE_GAP : NODE_W
    const myGen = gen.get(personId) ?? 0
    const y = myGen * (NODE_H + V_GAP)
    const coupleStartX = centerX - coupleW / 2
    if (!positioned.has(personId)) positioned.set(personId, { x: coupleStartX, y })
    if (cId && !positioned.has(cId)) {
      positioned.set(cId, { x: coupleStartX + NODE_W + COUPLE_GAP, y })
      visited.add(cId)
    }
    if (children.length > 0) {
      let cx = centerX - totalChild / 2
      children.forEach((c, i) => {
        if (!visited.has(c)) placeAt(c, cx + childWidths[i] / 2, new Set(visited))
        cx += childWidths[i] + H_GAP
      })
    }
  }

  const rootWidths = roots.map((r) => estimateW(r.id, byId, new Set()))
  let totalRootW = rootWidths.reduce((s, w) => s + w + H_GAP * 3, 0)
  if (totalRootW > 0) totalRootW -= H_GAP * 3
  let curX = -totalRootW / 2
  roots.forEach((r, i) => {
    placeAt(r.id, curX + rootWidths[i] / 2)
    curX += rootWidths[i] + H_GAP * 3
  })
  people.forEach((p) => {
    if (!positioned.has(p.id)) {
      const g = gen.get(p.id) ?? 0
      positioned.set(p.id, { x: curX, y: g * (NODE_H + V_GAP) })
      curX += NODE_W + H_GAP
    }
  })

  return { positions: positioned, genMap: gen }
}

// ── Inner component (precisa estar dentro do ReactFlowProvider) ────
function FamilyTreeInner({ people, onNodeClick, selectedId, focusPersonId, zoomToId }) {
  const { setCenter, fitView } = useReactFlow()
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])

  const { positions, genMap } = useMemo(() => buildHierarchicalLayout(people), [people])

  // Conjunto de nós visíveis no modo foco
  const visibleIds = useMemo(() => {
    if (!focusPersonId) return null
    const p = byId.get(focusPersonId)
    if (!p) return null
    const ids = new Set([focusPersonId])
    if (p.pai) ids.add(p.pai)
    if (p.mae) ids.add(p.mae)
    if (p.conjuge) ids.add(p.conjuge)
    p.filhos?.forEach((id) => ids.add(id))
    // Avós
    if (p.pai) {
      const pai = byId.get(p.pai)
      if (pai?.pai) ids.add(pai.pai)
      if (pai?.mae) ids.add(pai.mae)
      if (pai?.conjuge) ids.add(pai.conjuge)
    }
    if (p.mae) {
      const mae = byId.get(p.mae)
      if (mae?.pai) ids.add(mae.pai)
      if (mae?.mae) ids.add(mae.mae)
      if (mae?.conjuge) ids.add(mae.conjuge)
    }
    return ids
  }, [focusPersonId, byId])

  const initialNodes = useMemo(() => {
    return people
      .filter((p) => !visibleIds || visibleIds.has(p.id))
      .map((p) => {
        const g = genMap.get(p.id) ?? 0
        const pos = positions.get(p.id) ?? { x: 0, y: 0 }
        const pai = p.pai ? byId.get(p.pai) : null
        const mae = p.mae ? byId.get(p.mae) : null
        const conjuge = p.conjuge ? byId.get(p.conjuge) : null
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
            paiNome: pai?.nome ?? null,
            maeNome: mae?.nome ?? null,
            conjugeNome: conjuge?.nome ?? null,
            onClick: onNodeClick,
          },
        }
      })
  }, [people, positions, genMap, onNodeClick, selectedId, visibleIds, byId])

  const initialEdges = useMemo(() => {
    const edges = []
    const addedCouple = new Set()
    people.forEach((p) => {
      if (visibleIds && !visibleIds.has(p.id)) return
      if (p.conjuge && !addedCouple.has(`${p.conjuge}-${p.id}`)) {
        addedCouple.add(`${p.id}-${p.conjuge}`)
        if (!visibleIds || visibleIds.has(p.conjuge)) {
          edges.push({
            id: `conjuge-${p.id}-${p.conjuge}`,
            source: p.id,
            target: p.conjuge,
            type: 'straight',
            style: { stroke: '#94a3b8', strokeWidth: 2, strokeDasharray: '6,3' },
          })
        }
      }
      if (p.pai && (!visibleIds || visibleIds.has(p.pai))) {
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
      if (p.mae && (!visibleIds || visibleIds.has(p.mae))) {
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
  }, [people, genMap, visibleIds])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => { setNodes(initialNodes) }, [initialNodes, setNodes])
  useEffect(() => { setEdges(initialEdges) }, [initialEdges, setEdges])

  // Zoom para pessoa específica (busca ou seleção)
  useEffect(() => {
    if (!zoomToId) return
    const pos = positions.get(zoomToId)
    if (!pos) return
    const cx = pos.x + NODE_W / 2
    const cy = pos.y + NODE_H / 2
    setTimeout(() => setCenter(cx, cy, { zoom: 1.2, duration: 600 }), 50)
  }, [zoomToId, positions, setCenter])

  // fitView ao trocar modo foco
  const prevFocus = useRef(null)
  useEffect(() => {
    if (focusPersonId !== prevFocus.current) {
      prevFocus.current = focusPersonId
      setTimeout(() => fitView({ padding: 0.2, duration: 500 }), 60)
    }
  }, [focusPersonId, fitView])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.12 }}
      minZoom={0.04}
      maxZoom={2.5}
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
        nodeColor={(n) => GEN_COLORS[Math.min(n.data?.generation ?? 0, GEN_COLORS.length - 1)]}
        maskColor="rgba(240,244,248,0.6)"
      />
    </ReactFlow>
  )
}

// ── Wrapper público ────────────────────────────────────────────────
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
