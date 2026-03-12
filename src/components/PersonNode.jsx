import { memo, useState } from 'react'
import { Handle, Position } from 'reactflow'
import './PersonNode.css'

const GENERATION_COLORS = [
  { bg: '#ebefff', border: '#3b5bdb', avatar: 'linear-gradient(135deg, #3b5bdb, #6c63ff)', text: '#2f4ac7', label: 'Fundador(a)' },
  { bg: '#e6faf4', border: '#0ca678', avatar: 'linear-gradient(135deg, #0ca678, #20c997)', text: '#087f5b', label: '1ª geração' },
  { bg: '#fff3e0', border: '#e67700', avatar: 'linear-gradient(135deg, #e67700, #fd9a00)', text: '#b45309', label: '2ª geração' },
  { bg: '#f5e6fd', border: '#ae3ec9', avatar: 'linear-gradient(135deg, #ae3ec9, #cc5de8)', text: '#862e9c', label: '3ª+ geração' },
]

function getInitials(nome) {
  const parts = nome.split(' ').filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function PersonNode({ data, selected }) {
  const { nome, generation = 0, onClick, hasConjuge, filhosCount, conjugeNome, paiNome, maeNome } = data
  const colorIdx = Math.min(generation, GENERATION_COLORS.length - 1)
  const colors = GENERATION_COLORS[colorIdx]
  const [tooltipVisible, setTooltipVisible] = useState(false)

  const hasTooltip = conjugeNome || paiNome || maeNome || filhosCount > 0

  return (
    <div
      className={`person-node ${selected ? 'person-node--selected' : ''}`}
      style={{
        '--node-bg': colors.bg,
        '--node-border': colors.border,
        '--node-text': colors.text,
        '--node-avatar': colors.avatar,
      }}
      onClick={() => onClick?.(data)}
      role="button"
      tabIndex={0}
      onMouseEnter={() => hasTooltip && setTooltipVisible(true)}
      onMouseLeave={() => setTooltipVisible(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.(data)
        }
      }}
    >
      <Handle type="target" position={Position.Top} className="person-node__handle" />

      <div className="person-node__inner">
        <div className="person-node__avatar">{getInitials(nome)}</div>
        <div className="person-node__info">
          <span className="person-node__name">{nome}</span>
          <div className="person-node__meta">
            <span className="person-node__gen-label">{colors.label}</span>
            <div className="person-node__badges">
              {hasConjuge && <span className="person-node__badge" title="Tem cônjuge">💍</span>}
              {filhosCount > 0 && (
                <span className="person-node__badge">👶 {filhosCount}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip hover */}
      {tooltipVisible && hasTooltip && (
        <div className="person-node__tooltip" onClick={(e) => e.stopPropagation()}>
          {paiNome && <div className="person-node__tooltip-row"><span className="person-node__tooltip-label">Pai</span>{paiNome}</div>}
          {maeNome && <div className="person-node__tooltip-row"><span className="person-node__tooltip-label">Mãe</span>{maeNome}</div>}
          {conjugeNome && <div className="person-node__tooltip-row"><span className="person-node__tooltip-label">Cônjuge</span>{conjugeNome}</div>}
          {filhosCount > 0 && <div className="person-node__tooltip-row"><span className="person-node__tooltip-label">Filhos</span>{filhosCount}</div>}
          <div className="person-node__tooltip-hint">Clique para detalhes</div>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="person-node__handle" />
    </div>
  )
}

export default memo(PersonNode)
