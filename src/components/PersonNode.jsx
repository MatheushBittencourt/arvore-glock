import { memo, useState } from 'react'
import { Handle, Position } from 'reactflow'
import './PersonNode.css'

// Paleta idêntica à do FamilyTree
const PALETTE = [
  { color: '#3b5bdb', bg: '#eef2ff', border: '#818cf8', label: 'Fundadores' },
  { color: '#0891b2', bg: '#ecfeff', border: '#22d3ee', label: '1ª geração'  },
  { color: '#0ca678', bg: '#ecfdf5', border: '#34d399', label: '2ª geração'  },
  { color: '#d97706', bg: '#fffbeb', border: '#fbbf24', label: '3ª geração'  },
  { color: '#7c3aed', bg: '#f5f3ff', border: '#a78bfa', label: '4ª+ geração' },
]

function initials(nome) {
  const p = nome.trim().split(/\s+/)
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

function PersonNode({ data, selected }) {
  const {
    nome, generation = 0, isSpouseOnly = false,
    hasConjuge, filhosCount, paiNome, maeNome, conjugeNome,
    fotoUrl, falecimento,
    onClick,
  } = data

  const pal   = PALETTE[Math.min(generation, PALETTE.length - 1)]
  const label = isSpouseOnly ? 'Cônjuge' : pal.label
  const isDead = !!falecimento

  const [tip, setTip] = useState(false)
  const hasTip = paiNome || maeNome || conjugeNome || filhosCount > 0

  return (
    <div
      className={`pn ${selected ? 'pn--selected' : ''} ${isDead ? 'pn--dead' : ''}`}
      style={{ '--bg': pal.bg, '--bd': pal.border, '--co': pal.color }}
      onClick={() => onClick?.(data)}
      onMouseEnter={() => hasTip && setTip(true)}
      onMouseLeave={() => setTip(false)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(data) } }}
    >
      <Handle type="target"  position={Position.Top}    className="pn__handle" />
      <Handle type="source"  position={Position.Bottom} className="pn__handle" />

      <div className="pn__body">
        {/* Avatar */}
        <div className="pn__av" style={fotoUrl ? {} : { background: `linear-gradient(135deg, ${pal.color}, ${pal.border})` }}>
          {fotoUrl
            ? <img src={fotoUrl} alt={nome} className="pn__av-photo" />
            : initials(nome)
          }
          {isDead && <span className="pn__dead-icon">✝</span>}
        </div>

        {/* Info */}
        <div className="pn__info">
          <div className="pn__name">{nome}</div>
          <div className="pn__foot">
            <span className="pn__label">{label}</span>
            <div className="pn__pills">
              {hasConjuge  && <span className="pn__pill pn__pill--ring"  title="Tem cônjuge">casado(a)</span>}
              {filhosCount > 0 && <span className="pn__pill" title={`${filhosCount} filho(s)`}>{filhosCount} {filhosCount === 1 ? 'filho' : 'filhos'}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tip && hasTip && (
        <div className="pn__tip" onClick={e => e.stopPropagation()}>
          {paiNome    && <Row k="Pai"     v={paiNome} />}
          {maeNome    && <Row k="Mãe"     v={maeNome} />}
          {conjugeNome && <Row k="Cônjuge" v={conjugeNome} />}
          {filhosCount > 0 && <Row k="Filhos" v={filhosCount} />}
          <div className="pn__tip-hint">Clique para ver detalhes</div>
        </div>
      )}
    </div>
  )
}

function Row({ k, v }) {
  return (
    <div className="pn__tip-row">
      <span className="pn__tip-k">{k}</span>
      <span className="pn__tip-v">{v}</span>
    </div>
  )
}

export default memo(PersonNode)
