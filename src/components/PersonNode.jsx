import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import './PersonNode.css'

const GENERATION_COLORS = [
  { bg: '#ebefff', border: '#3b5bdb', avatar: 'linear-gradient(135deg, #3b5bdb, #6c63ff)', text: '#2f4ac7' },
  { bg: '#e6faf4', border: '#0ca678', avatar: 'linear-gradient(135deg, #0ca678, #20c997)', text: '#087f5b' },
  { bg: '#fff3e0', border: '#e67700', avatar: 'linear-gradient(135deg, #e67700, #fd9a00)', text: '#b45309' },
  { bg: '#f5e6fd', border: '#ae3ec9', avatar: 'linear-gradient(135deg, #ae3ec9, #cc5de8)', text: '#862e9c' },
]

function getInitials(nome) {
  return nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

function PersonNode({ data, selected }) {
  const { nome, generation = 0, onClick, hasConjuge, filhosCount } = data
  const colorIdx = Math.min(generation, GENERATION_COLORS.length - 1)
  const colors = GENERATION_COLORS[colorIdx]

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
          {(hasConjuge || filhosCount > 0) && (
            <div className="person-node__badges">
              {hasConjuge && (
                <span className="person-node__badge person-node__badge--conjuge" title="Tem cônjuge">
                  💍
                </span>
              )}
              {filhosCount > 0 && (
                <span className="person-node__badge" title={`${filhosCount} filho(s)`}>
                  {filhosCount} filho{filhosCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="person-node__handle" />
    </div>
  )
}

export default memo(PersonNode)
