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

const NODE_WIDTH = 220
const LEVEL_HEIGHT = 160
const HORIZONTAL_GAP = 60

const nodeTypes = { personNode: PersonNode }

const GENERATION_EDGE_COLORS = ['#3b5bdb', '#0ca678', '#e67700', '#ae3ec9']

function buildDepthMap(people) {
  const depth = new Map()

  people.forEach((p) => {
    depth.set(p.id, p.pai == null && p.mae == null ? 0 : -1)
  })

  let changed = true
  while (changed) {
    changed = false
    people.forEach((p) => {
      if (depth.get(p.id) >= 0) return
      const dPai = p.pai != null ? depth.get(p.pai) : 0
      const dMae = p.mae != null ? depth.get(p.mae) : 0
      if (p.pai != null && dPai < 0) return
      if (p.mae != null && dMae < 0) return
      const d = 1 + Math.max(dPai ?? 0, dMae ?? 0)
      depth.set(p.id, d)
      changed = true
    })
  }

  people.forEach((p) => {
    if (depth.get(p.id) < 0) depth.set(p.id, 999)
  })
  return depth
}

function buildLayout(people, depthMap) {
  const byDepth = new Map()
  people.forEach((p) => {
    const d = depthMap.get(p.id) ?? 0
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d).push(p)
  })

  const sortedDepths = [...byDepth.keys()].sort((a, b) => a - b)
  const positions = new Map()

  sortedDepths.forEach((depth) => {
    const levelPeople = byDepth.get(depth).slice().sort((a, b) => a.nome.localeCompare(b.nome))
    const totalWidth = levelPeople.length * NODE_WIDTH + (levelPeople.length - 1) * HORIZONTAL_GAP
    const startX = -totalWidth / 2 + NODE_WIDTH / 2
    levelPeople.forEach((p, i) => {
      positions.set(p.id, {
        x: startX + i * (NODE_WIDTH + HORIZONTAL_GAP),
        y: depth * LEVEL_HEIGHT,
      })
    })
  })

  return positions
}

function FamilyTree({ people, onNodeClick, selectedId }) {
  const depthMap = useMemo(() => buildDepthMap(people), [people])

  const positionMap = useMemo(() => buildLayout(people, depthMap), [people, depthMap])

  const initialNodes = useMemo(() => {
    return people.map((p) => {
      const gen = depthMap.get(p.id) ?? 0
      return {
        id: p.id,
        type: 'personNode',
        position: positionMap.get(p.id) ?? { x: 0, y: 0 },
        selected: p.id === selectedId,
        data: {
          id: p.id,
          nome: p.nome,
          generation: Math.min(gen, 3),
          hasConjuge: !!p.conjuge,
          filhosCount: Array.isArray(p.filhos) ? p.filhos.length : 0,
          onClick: onNodeClick,
        },
      }
    })
  }, [people, positionMap, depthMap, onNodeClick, selectedId])

  const initialEdges = useMemo(() => {
    const edges = []
    people.forEach((p) => {
      if (p.pai) {
        const gen = depthMap.get(p.id) ?? 0
        const colorIdx = Math.min(gen - 1, GENERATION_EDGE_COLORS.length - 1)
        const color = GENERATION_EDGE_COLORS[Math.max(colorIdx, 0)]
        edges.push({
          id: `pai-${p.id}`,
          source: p.pai,
          target: p.id,
          type: 'smoothstep',
          style: { stroke: color, strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color,
            width: 14,
            height: 14,
          },
        })
      }
      if (p.mae) {
        const gen = depthMap.get(p.id) ?? 0
        const colorIdx = Math.min(gen - 1, GENERATION_EDGE_COLORS.length - 1)
        const color = GENERATION_EDGE_COLORS[Math.max(colorIdx, 0)]
        edges.push({
          id: `mae-${p.id}`,
          source: p.mae,
          target: p.id,
          type: 'smoothstep',
          style: { stroke: color, strokeWidth: 2, strokeDasharray: '5,4' },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color,
            width: 14,
            height: 14,
          },
        })
      }
    })
    return edges
  }, [people, depthMap])

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
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.05}
        maxZoom={2}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        nodesDraggable
        elementsSelectable
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#c8d0da"
        />
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
          style={{
            bottom: 16,
            right: 16,
            borderRadius: 12,
            border: '1px solid #dde3ea',
          }}
          nodeColor={(n) => {
            const genColors = ['#3b5bdb', '#0ca678', '#e67700', '#ae3ec9']
            const gen = n.data?.generation ?? 0
            return genColors[Math.min(gen, 3)]
          }}
          maskColor="rgba(240,244,248,0.6)"
        />
      </ReactFlow>
    </div>
  )
}

export default FamilyTree
