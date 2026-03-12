import { useState, useEffect, useCallback, useMemo } from 'react'
import FamilyTree from './components/FamilyTree.jsx'
import PersonEditor from './components/PersonEditor.jsx'
import SearchBar from './components/SearchBar.jsx'
import initialFamily from './data/initialFamily.json'
import { supabase } from './lib/supabase.js'
import './App.css'

const LS_KEY = 'glock-family-tree'

function lsSave(p) { try { localStorage.setItem(LS_KEY, JSON.stringify(p)) } catch (_) {} }
function lsLoad() {
  try { const r = localStorage.getItem(LS_KEY); if (r) { const d = JSON.parse(r); return Array.isArray(d) ? d : [] } } catch (_) {}
  return []
}

async function dbLoadAll() {
  if (!supabase) throw new Error('Supabase não configurado')
  const { data, error } = await supabase.from('pessoas').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return data.map(rowToPerson)
}
async function dbUpsert(person) {
  if (!supabase) return
  const { error } = await supabase.from('pessoas').upsert(personToRow(person), { onConflict: 'id' })
  if (error) throw error
}
async function dbSeedInitial(people) {
  if (!supabase) return
  // Só insere registros que ainda NÃO existem — nunca sobrescreve dados editados pelo usuário
  const { data: existing } = await supabase.from('pessoas').select('id')
  const existingIds = new Set((existing || []).map(r => r.id))
  const toInsert = people.filter(p => !existingIds.has(p.id))
  if (!toInsert.length) return
  const { error } = await supabase.from('pessoas').insert(toInsert.map(personToRow))
  if (error) throw error
}
async function dbDeleteAll() {
  if (!supabase) return
  const { error } = await supabase.from('pessoas').delete().neq('id', '__none__')
  if (error) throw error
}

function personToRow(p) {
  return { id: p.id, nome: p.nome, pai: p.pai ?? null, mae: p.mae ?? null, conjuge: p.conjuge ?? null, filhos: Array.isArray(p.filhos) ? p.filhos : [], updated_at: new Date().toISOString() }
}
function rowToPerson(row) {
  return { id: row.id, nome: row.nome, pai: row.pai ?? null, mae: row.mae ?? null, conjuge: row.conjuge ?? null, filhos: Array.isArray(row.filhos) ? row.filhos : [] }
}

function syncBidirectional(people, updated) {
  const byId = new Map(people.map((p) => [p.id, { ...p }]))
  const prev = byId.get(updated.id)
  byId.set(updated.id, { ...updated })
  if (prev) {
    if (prev.pai && prev.pai !== updated.pai) { const o = byId.get(prev.pai); if (o) { o.filhos = o.filhos.filter((id) => id !== updated.id); byId.set(o.id, o) } }
    if (prev.mae && prev.mae !== updated.mae) { const o = byId.get(prev.mae); if (o) { o.filhos = o.filhos.filter((id) => id !== updated.id); byId.set(o.id, o) } }
    if (prev.conjuge && prev.conjuge !== updated.conjuge) { const o = byId.get(prev.conjuge); if (o && o.conjuge === updated.id) { o.conjuge = null; byId.set(o.id, o) } }
    prev.filhos?.forEach((cid) => { if (!updated.filhos?.includes(cid)) { const c = byId.get(cid); if (c) { if (c.pai === updated.id) c.pai = null; if (c.mae === updated.id) c.mae = null; byId.set(c.id, c) } } })
  }
  if (updated.pai) { const p = byId.get(updated.pai); if (p) { const f = [...(p.filhos||[])]; if (!f.includes(updated.id)) f.push(updated.id); byId.set(p.id, {...p, filhos: f}) } }
  if (updated.mae) { const p = byId.get(updated.mae); if (p) { const f = [...(p.filhos||[])]; if (!f.includes(updated.id)) f.push(updated.id); byId.set(p.id, {...p, filhos: f}) } }
  if (updated.conjuge) { const p = byId.get(updated.conjuge); if (p) byId.set(p.id, {...p, conjuge: updated.id}) }
  updated.filhos?.forEach((cid) => { const c = byId.get(cid); if (c) { const n = {...c}; if (c.pai !== updated.id && c.mae !== updated.id) { if (!n.pai) n.pai = updated.id; else if (!n.mae) n.mae = updated.id }; byId.set(c.id, n) } })
  return [...byId.values()]
}

function getInitials(nome) {
  const p = nome.split(' ').filter(Boolean)
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

function computeStats(people) {
  const byId = new Map(people.map((p) => [p.id, p]))
  const genMap = new Map()
  people.forEach((p) => genMap.set(p.id, !p.pai && !p.mae ? 0 : -1))
  let ch = true
  while (ch) {
    ch = false
    people.forEach((p) => {
      if (genMap.get(p.id) >= 0) return
      const gp = p.pai != null ? genMap.get(p.pai) : 0
      const gm = p.mae != null ? genMap.get(p.mae) : 0
      if (p.pai != null && gp < 0) return
      if (p.mae != null && gm < 0) return
      genMap.set(p.id, 1 + Math.max(gp ?? 0, gm ?? 0)); ch = true
    })
  }
  const gens = [...genMap.values()].filter((g) => g >= 0)
  const maxGen = gens.length ? Math.max(...gens) : 0
  const marriages = people.filter((p) => p.conjuge && p.id < p.conjuge).length
  return { total: people.length, geracoes: maxGen + 1, casamentos: marriages }
}

export default function App() {
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncError, setSyncError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [focusPersonId, setFocusPersonId] = useState(null)
  const [zoomToId, setZoomToId] = useState(null)
  const [importError, setImportError] = useState(null)
  const [showReset, setShowReset] = useState(false)
  const [showStats, setShowStats] = useState(false)

  useEffect(() => {
    async function init() {
      try {
        let remote = await dbLoadAll()

        if (remote.length === 0) {
          // Banco vazio: sobe os dados iniciais
          await dbSeedInitial(initialFamily)
          remote = initialFamily
        } else {
          // Migração pontual: remove IDs que não existem mais no initialFamily
          // E que também não foram adicionados pelo usuário (sem pai/mãe/conjuge apontando para eles)
          const initialIds = new Set(initialFamily.map(p => p.id))
          const remoteIds  = new Set(remote.map(p => p.id))
          // IDs referenciados por alguma pessoa do banco (filhos, pai, mãe, cônjuge)
          const referenced = new Set()
          remote.forEach(p => {
            if (p.pai)    referenced.add(p.pai)
            if (p.mae)    referenced.add(p.mae)
            if (p.conjuge) referenced.add(p.conjuge)
            ;(p.filhos || []).forEach(id => referenced.add(id))
          })
          // IDs "órfãos" antigos: não estão no initialFamily atual E não são referenciados por ninguém
          const staleIds = remote
            .filter(p => !initialIds.has(p.id) && !referenced.has(p.id))
            .map(p => p.id)
          if (staleIds.length > 0 && supabase) {
            await Promise.all(staleIds.map(id => supabase.from('pessoas').delete().eq('id', id)))
            remote = remote.filter(p => !staleIds.includes(p.id))
          }
          // Garante que os registros do initialFamily estão atualizados
          await dbSeedInitial(initialFamily)
          // Recarrega para garantir consistência
          remote = await dbLoadAll()
        }

        setPeople(remote); lsSave(remote)
      } catch (err) {
        console.error(err)
        const cached = lsLoad()
        setPeople(cached.length > 0 ? cached : initialFamily)
        setSyncError('Sem conexão com o banco. Exibindo dados locais.')
      } finally { setLoading(false) }
    }
    init()
  }, [])

  useEffect(() => { if (!syncError) return; const t = setTimeout(() => setSyncError(null), 5000); return () => clearTimeout(t) }, [syncError])
  useEffect(() => { if (!importError) return; const t = setTimeout(() => setImportError(null), 4000); return () => clearTimeout(t) }, [importError])

  const handleNodeClick = useCallback((data) => {
    if (data?.id) setSelectedId((prev) => prev === data.id ? null : data.id)
  }, [])

  const handleSearchSelect = useCallback((person) => {
    setSelectedId(person.id)
    setZoomToId(person.id)
    setTimeout(() => setZoomToId(null), 800)
  }, [])

  const handleSavePerson = useCallback(async (person) => {
    const exists = people.some((p) => p.id === person.id)
    const next = syncBidirectional(people, person)
    setPeople(next); lsSave(next)
    if (exists) setEditingId(null); else setShowAdd(false)
    setSelectedId(null)
    try {
      const affected = new Set([person.id, person.pai, person.mae, person.conjuge, ...(person.filhos || [])].filter(Boolean))
      await Promise.all(next.filter((p) => affected.has(p.id)).map(dbUpsert))
    } catch (err) { console.error(err); setSyncError('Erro ao sincronizar. Alteração salva localmente.') }
  }, [people])

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(people, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'familia-glock.json'; a.click()
    URL.revokeObjectURL(url)
  }, [people])

  const handleImport = useCallback(async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setImportError(null)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result ?? '[]')
        const valid = (Array.isArray(data) ? data : []).filter((p) => p && typeof p.id === 'string' && typeof p.nome === 'string')
        if (!valid.length && data.length) { setImportError('JSON inválido: esperado array com id e nome.'); return }
        setPeople(valid); lsSave(valid); setSelectedId(null)
        try { await Promise.all(valid.map(dbUpsert)) } catch { setSyncError('Importado localmente. Erro no banco.') }
      } catch { setImportError('Arquivo JSON inválido.') }
    }
    reader.readAsText(file); e.target.value = ''
  }, [])

  const handleDeletePerson = useCallback(async (id) => {
    // Remove referências dessa pessoa em todos os outros registros
    const next = people
      .filter((p) => p.id !== id)
      .map((p) => ({
        ...p,
        pai: p.pai === id ? null : p.pai,
        mae: p.mae === id ? null : p.mae,
        conjuge: p.conjuge === id ? null : p.conjuge,
        filhos: (p.filhos || []).filter((fid) => fid !== id),
      }))
    setPeople(next); lsSave(next)
    setEditingId(null); setSelectedId(null)
    try {
      if (supabase) await supabase.from('pessoas').delete().eq('id', id)
      // Atualiza registros afetados no banco
      const affected = next.filter((p) =>
        p.pai === null && people.find((o) => o.id === p.id)?.pai === id ||
        p.mae === null && people.find((o) => o.id === p.id)?.mae === id ||
        p.conjuge === null && people.find((o) => o.id === p.id)?.conjuge === id ||
        people.find((o) => o.id === p.id)?.filhos?.includes(id)
      )
      await Promise.all(affected.map(dbUpsert))
    } catch (err) { console.error(err); setSyncError('Erro ao excluir no banco. Alteração salva localmente.') }
  }, [people])

  const handleReset = useCallback(async () => {
    setPeople(initialFamily); lsSave(initialFamily); setSelectedId(null); setFocusPersonId(null); setShowReset(false)
    try { await dbDeleteAll(); await dbSeedInitial(initialFamily) } catch { setSyncError('Redefinido localmente. Erro no banco.') }
  }, [])

  const stats = useMemo(() => computeStats(people), [people])
  const selectedPerson = selectedId ? people.find((p) => p.id === selectedId) : null
  const editingPerson = editingId ? people.find((p) => p.id === editingId) : null
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const paiNome = selectedPerson?.pai ? byId.get(selectedPerson.pai)?.nome : null
  const maeNome = selectedPerson?.mae ? byId.get(selectedPerson.mae)?.nome : null
  const conjugeNome = selectedPerson?.conjuge ? byId.get(selectedPerson.conjuge)?.nome : null
  const filhosNomes = selectedPerson?.filhos?.map((id) => byId.get(id)?.nome).filter(Boolean) ?? []

  if (loading) {
    return (
      <div className="app app--loading">
        <div className="app__loader">
          <div className="app__loader-icon">🌳</div>
          <div className="app__loader-text">Carregando árvore genealógica…</div>
          <div className="app__loader-spinner" />
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="app__header">
        <div className="app__brand">
          <div className="app__brand-icon">🌳</div>
          <div className="app__brand-text">
            <div className="app__title">Família Glock</div>
            <div className="app__subtitle">Árvore Genealógica</div>
          </div>
        </div>

        <SearchBar people={people} onSelect={handleSearchSelect} />

        <div className="app__actions">
          <button
            type="button"
            className={`btn btn--ghost app__btn--hide-mobile ${focusPersonId ? 'btn--active' : ''}`}
            onClick={() => setFocusPersonId(null)}
            title="Exibir toda a árvore"
            disabled={!focusPersonId}
          >
            <span className="btn__icon">🌐</span>
            <span className="app__btn-label">Árvore completa</span>
          </button>

          {/* Botão árvore completa visível no mobile só quando foco ativo */}
          {focusPersonId && (
            <button
              type="button"
              className="btn btn--active app__btn--show-focus-mobile"
              onClick={() => setFocusPersonId(null)}
              title="Exibir toda a árvore"
            >
              <span className="btn__icon">🌐</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn--ghost app__btn--hide-mobile"
            onClick={() => setShowStats(true)}
            title="Estatísticas"
          >
            <span className="btn__icon">📊</span>
            <span className="app__btn-label">Estatísticas</span>
          </button>

          <div className="app__divider" />

          <button
            type="button"
            className="btn btn--primary app__btn--new-desktop"
            onClick={() => setShowAdd(true)}
          >
            <span className="btn__icon">＋</span>
            Nova pessoa
          </button>

          <button type="button" className="btn btn--ghost app__btn--hide-mobile" onClick={handleExport} title="Exportar JSON">
            <span className="btn__icon">💾</span>
          </button>
        </div>
      </header>

      {/* ── Canvas ── */}
      <main className="app__main">
        <FamilyTree
          people={people}
          onNodeClick={handleNodeClick}
          selectedId={selectedId}
          focusPersonId={focusPersonId}
          zoomToId={zoomToId}
        />

        {/* ── Info panel ── */}
        {selectedPerson && (
          <aside className="app__info-panel">
            <div className="info-panel__header">
              <div className="info-panel__avatar">{getInitials(selectedPerson.nome)}</div>
              <div>
                <div className="info-panel__name">{selectedPerson.nome}</div>
                {(paiNome || maeNome) && (
                  <div className="info-panel__parents">
                    {[paiNome, maeNome].filter(Boolean).join(' & ')}
                  </div>
                )}
              </div>
            </div>
            <div className="info-panel__body">
              {conjugeNome && (
                <div className="info-panel__row">
                  <span className="info-panel__icon">💍</span>
                  <span className="info-panel__label">Cônjuge</span>
                  <span className="info-panel__value">{conjugeNome}</span>
                </div>
              )}
              {filhosNomes.length > 0 && (
                <div className="info-panel__row info-panel__row--col">
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span className="info-panel__icon">👶</span>
                    <span className="info-panel__label">Filhos ({filhosNomes.length})</span>
                  </div>
                  <div className="info-panel__filhos">
                    {filhosNomes.map((n, i) => <span key={i} className="info-panel__filho-tag">{n}</span>)}
                  </div>
                </div>
              )}
              {!conjugeNome && filhosNomes.length === 0 && !paiNome && !maeNome && (
                <div className="info-panel__empty">Nenhuma relação cadastrada.</div>
              )}
            </div>
            <div className="info-panel__actions">
              <button
                type="button"
                className="btn btn--ghost info-panel__focus-btn"
                onClick={() => { setFocusPersonId(selectedPerson.id); setSelectedId(null) }}
                title="Ver apenas família desta pessoa"
              >
                🔍 Focar família
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => { setEditingId(selectedPerson.id); setSelectedId(null) }}
              >
                ✏️ Editar
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setSelectedId(null)}>✕</button>
            </div>
          </aside>
        )}

        {/* ── Faixa de foco ativo ── */}
        {focusPersonId && (
          <div className="app__focus-banner">
            <span>🔍 Exibindo família de <strong>{byId.get(focusPersonId)?.nome}</strong></span>
            <button type="button" className="app__focus-close" onClick={() => setFocusPersonId(null)}>
              Ver árvore completa
            </button>
          </div>
        )}

        {/* ── Legenda ── */}
        <div className="app__legend">
          <div className="legend__title">Gerações</div>
          {[
            { color: '#3b5bdb', label: 'Fundadores' },
            { color: '#0891b2', label: '1ª geração' },
            { color: '#0ca678', label: '2ª geração' },
            { color: '#d97706', label: '3ª geração' },
            { color: '#7c3aed', label: '4ª+ geração' },
          ].map((l) => (
            <div key={l.label} className="legend__item">
              <div className="legend__dot" style={{ background: l.color }} />
              <span>{l.label}</span>
            </div>
          ))}
          <div className="legend__divider" />
          <div className="legend__title">Linhas</div>
          <div className="legend__item">
            <div className="legend__line legend__line--solid" />
            <span>Linha paterna</span>
          </div>
          <div className="legend__item">
            <div className="legend__line legend__line--dashed" />
            <span>Linha materna</span>
          </div>
          <div className="legend__item">
            <div className="legend__line legend__line--couple" />
            <span>Cônjuges</span>
          </div>
        </div>

        {/* ── Badge Supabase ── */}
        <div className="app__sync-badge">
          <span className="app__sync-dot" />
          Supabase
        </div>
      </main>

      {/* ── FAB mobile (Nova pessoa) ── */}
      <button
        type="button"
        className="app__fab"
        onClick={() => setShowAdd(true)}
        aria-label="Nova pessoa"
      >
        ＋
      </button>

      {/* ── Toasts ── */}
      {(importError || syncError) && (
        <p className="app__error" role="alert">{importError || syncError}</p>
      )}

      {/* ── Modal Estatísticas ── */}
      {showStats && (
        <div className="modal-overlay" onClick={() => setShowStats(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <h2 className="modal__title">📊 Estatísticas</h2>
              <button type="button" className="modal__close" onClick={() => setShowStats(false)}>✕</button>
            </div>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-card__value">{stats.total}</div>
                <div className="stat-card__label">Pessoas</div>
              </div>
              <div className="stat-card">
                <div className="stat-card__value">{stats.geracoes}</div>
                <div className="stat-card__label">Gerações</div>
              </div>
              <div className="stat-card">
                <div className="stat-card__value">{stats.casamentos}</div>
                <div className="stat-card__label">Casamentos</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Confirmar Reset ── */}
      {showReset && (
        <div className="modal-overlay" onClick={() => setShowReset(false)}>
          <div className="modal modal--sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <h2 className="modal__title">↺ Restaurar dados</h2>
              <button type="button" className="modal__close" onClick={() => setShowReset(false)}>✕</button>
            </div>
            <p className="modal__text">
              Isso vai apagar todas as alterações e restaurar os dados originais da família Glock. Esta ação não pode ser desfeita.
            </p>
            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setShowReset(false)}>Cancelar</button>
              <button type="button" className="btn btn--danger" onClick={handleReset}>Sim, restaurar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modais de edição ── */}
      {showAdd && (
        <PersonEditor person={null} people={people} onSave={handleSavePerson} onCancel={() => setShowAdd(false)} isNew />
      )}
      {editingPerson && (
        <PersonEditor person={editingPerson} people={people} onSave={handleSavePerson} onCancel={() => setEditingId(null)} onDelete={handleDeletePerson} isNew={false} />
      )}
    </div>
  )
}
