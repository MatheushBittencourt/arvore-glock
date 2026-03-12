import { useState, useEffect, useCallback } from 'react'
import FamilyTree from './components/FamilyTree.jsx'
import PersonEditor from './components/PersonEditor.jsx'
import initialFamily from './data/initialFamily.json'
import { supabase } from './lib/supabase.js'
import './App.css'

// ── Fallback LocalStorage (offline / erro de rede) ────────────────
const LS_KEY = 'glock-family-tree'

function lsSave(people) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(people)) } catch (_) {}
}

function lsLoad() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) { const d = JSON.parse(raw); return Array.isArray(d) ? d : [] }
  } catch (_) {}
  return []
}

// ── Supabase helpers ──────────────────────────────────────────────
async function dbLoadAll() {
  const { data, error } = await supabase
    .from('pessoas')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map(rowToPerson)
}

async function dbUpsert(person) {
  const { error } = await supabase
    .from('pessoas')
    .upsert(personToRow(person), { onConflict: 'id' })
  if (error) throw error
}

async function dbDelete(id) {
  const { error } = await supabase.from('pessoas').delete().eq('id', id)
  if (error) throw error
}

async function dbSeedInitial(people) {
  const rows = people.map(personToRow)
  const { error } = await supabase
    .from('pessoas')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
  if (error) throw error
}

function personToRow(p) {
  return {
    id: p.id,
    nome: p.nome,
    pai: p.pai ?? null,
    mae: p.mae ?? null,
    conjuge: p.conjuge ?? null,
    filhos: Array.isArray(p.filhos) ? p.filhos : [],
    updated_at: new Date().toISOString(),
  }
}

function rowToPerson(row) {
  return {
    id: row.id,
    nome: row.nome,
    pai: row.pai ?? null,
    mae: row.mae ?? null,
    conjuge: row.conjuge ?? null,
    filhos: Array.isArray(row.filhos) ? row.filhos : [],
  }
}

// ── Sync bidirecional ─────────────────────────────────────────────
function syncBidirectional(people, updated) {
  const byId = new Map(people.map((p) => [p.id, { ...p }]))
  const prev = byId.get(updated.id)

  byId.set(updated.id, { ...updated })

  if (prev) {
    if (prev.pai && prev.pai !== updated.pai) {
      const old = byId.get(prev.pai)
      if (old) { old.filhos = old.filhos.filter((id) => id !== updated.id); byId.set(old.id, old) }
    }
    if (prev.mae && prev.mae !== updated.mae) {
      const old = byId.get(prev.mae)
      if (old) { old.filhos = old.filhos.filter((id) => id !== updated.id); byId.set(old.id, old) }
    }
    if (prev.conjuge && prev.conjuge !== updated.conjuge) {
      const old = byId.get(prev.conjuge)
      if (old && old.conjuge === updated.id) { old.conjuge = null; byId.set(old.id, old) }
    }
    prev.filhos?.forEach((childId) => {
      if (!updated.filhos?.includes(childId)) {
        const child = byId.get(childId)
        if (child) {
          if (child.pai === updated.id) child.pai = null
          if (child.mae === updated.id) child.mae = null
          byId.set(child.id, child)
        }
      }
    })
  }

  if (updated.pai) {
    const p = byId.get(updated.pai)
    if (p) { const f = [...(p.filhos || [])]; if (!f.includes(updated.id)) f.push(updated.id); byId.set(p.id, { ...p, filhos: f }) }
  }
  if (updated.mae) {
    const p = byId.get(updated.mae)
    if (p) { const f = [...(p.filhos || [])]; if (!f.includes(updated.id)) f.push(updated.id); byId.set(p.id, { ...p, filhos: f }) }
  }
  if (updated.conjuge) {
    const p = byId.get(updated.conjuge)
    if (p) byId.set(p.id, { ...p, conjuge: updated.id })
  }
  updated.filhos?.forEach((childId) => {
    const child = byId.get(childId)
    if (child) {
      const next = { ...child }
      if (child.pai !== updated.id && child.mae !== updated.id) {
        if (!next.pai) next.pai = updated.id
        else if (!next.mae) next.mae = updated.id
      }
      byId.set(child.id, next)
    }
  })

  return [...byId.values()]
}

function getInitials(nome) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
}

// ── App ───────────────────────────────────────────────────────────
export default function App() {
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncError, setSyncError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [importError, setImportError] = useState(null)

  // ── Carrega dados do Supabase na inicialização ──
  useEffect(() => {
    async function init() {
      try {
        let remote = await dbLoadAll()

        // Se banco vazio, sobe os dados iniciais
        if (remote.length === 0) {
          await dbSeedInitial(initialFamily)
          remote = initialFamily
        }

        setPeople(remote)
        lsSave(remote)
      } catch (err) {
        console.error('Supabase indisponível, usando cache local.', err)
        const cached = lsLoad()
        setPeople(cached.length > 0 ? cached : initialFamily)
        setSyncError('Sem conexão com o banco. Exibindo dados locais.')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  // ── Limpa o erro de sync após 5s ──
  useEffect(() => {
    if (!syncError) return
    const t = setTimeout(() => setSyncError(null), 5000)
    return () => clearTimeout(t)
  }, [syncError])

  // ── Limpa o erro de import após 4s ──
  useEffect(() => {
    if (!importError) return
    const t = setTimeout(() => setImportError(null), 4000)
    return () => clearTimeout(t)
  }, [importError])

  // ── Clique no nó ──
  const handleNodeClick = useCallback((data) => {
    if (data?.id) setSelectedId((prev) => (prev === data.id ? null : data.id))
  }, [])

  // ── Salvar pessoa ──
  const handleSavePerson = useCallback(async (person) => {
    const exists = people.some((p) => p.id === person.id)
    const newPeople = syncBidirectional(people, person)

    // Atualiza UI imediatamente (otimista)
    setPeople(newPeople)
    lsSave(newPeople)
    if (exists) { setEditingId(null) } else { setShowAdd(false) }
    setSelectedId(null)

    // Persiste no Supabase em background (upsert de todos os afetados)
    try {
      const affectedIds = new Set([person.id])
      if (person.pai) affectedIds.add(person.pai)
      if (person.mae) affectedIds.add(person.mae)
      if (person.conjuge) affectedIds.add(person.conjuge)
      person.filhos?.forEach((id) => affectedIds.add(id))

      await Promise.all(
        newPeople
          .filter((p) => affectedIds.has(p.id))
          .map((p) => dbUpsert(p))
      )
    } catch (err) {
      console.error('Erro ao salvar no Supabase:', err)
      setSyncError('Alteração salva localmente. Erro ao sincronizar com o banco.')
    }
  }, [people])

  // ── Exportar JSON ──
  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(people, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'familia-glock.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [people])

  // ── Importar JSON ──
  const handleImport = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(null)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target?.result ?? '[]')
        const list = Array.isArray(data) ? data : []
        const valid = list.filter((p) => p && typeof p.id === 'string' && typeof p.nome === 'string')
        if (valid.length === 0 && list.length > 0) {
          setImportError('JSON inválido: esperado array com id e nome.')
          return
        }
        setPeople(valid)
        lsSave(valid)
        setSelectedId(null)

        // Upsert tudo no Supabase
        try {
          await Promise.all(valid.map((p) => dbUpsert(p)))
        } catch (err) {
          console.error('Erro ao importar para o Supabase:', err)
          setSyncError('Importado localmente. Erro ao sincronizar com o banco.')
        }
      } catch {
        setImportError('Arquivo JSON inválido.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [])

  // ── Painel de detalhes ──
  const selectedPerson = selectedId ? people.find((p) => p.id === selectedId) : null
  const editingPerson = editingId ? people.find((p) => p.id === editingId) : null
  const byId = new Map(people.map((p) => [p.id, p]))
  const paiNome = selectedPerson?.pai ? byId.get(selectedPerson.pai)?.nome : null
  const maeNome = selectedPerson?.mae ? byId.get(selectedPerson.mae)?.nome : null
  const conjugeNome = selectedPerson?.conjuge ? byId.get(selectedPerson.conjuge)?.nome : null
  const filhosNomes = selectedPerson?.filhos?.map((id) => byId.get(id)?.nome).filter(Boolean) ?? []

  // ── Loading screen ──
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
          <div>
            <div className="app__title">Família Glock</div>
            <div className="app__subtitle">Árvore Genealógica</div>
          </div>
        </div>

        <div className="app__stats">
          <span>👥</span>
          <span>{people.length} pessoas</span>
        </div>

        <div className="app__actions">
          <button type="button" className="btn btn--primary" onClick={() => setShowAdd(true)}>
            <span className="btn__icon">＋</span>
            Nova pessoa
          </button>
          <label className="btn btn--ghost" style={{ cursor: 'pointer' }}>
            <span className="btn__icon">📂</span>
            Importar
            <input type="file" accept=".json,application/json" onChange={handleImport} className="app__file-input" />
          </label>
          <button type="button" className="btn btn--ghost" onClick={handleExport}>
            <span className="btn__icon">💾</span>
            Exportar
          </button>
        </div>
      </header>

      {/* ── Canvas ── */}
      <main className="app__main">
        <FamilyTree people={people} onNodeClick={handleNodeClick} selectedId={selectedId} />

        {/* ── Info panel ── */}
        {selectedPerson && (
          <aside className="app__info-panel">
            <div className="info-panel__header">
              <div className="info-panel__avatar">{getInitials(selectedPerson.nome)}</div>
              <div className="info-panel__name">{selectedPerson.nome}</div>
            </div>
            <div className="info-panel__body">
              {paiNome && (
                <div className="info-panel__row">
                  <span className="info-panel__label">Pai</span>
                  <span className="info-panel__value">{paiNome}</span>
                </div>
              )}
              {maeNome && (
                <div className="info-panel__row">
                  <span className="info-panel__label">Mãe</span>
                  <span className="info-panel__value">{maeNome}</span>
                </div>
              )}
              {conjugeNome && (
                <div className="info-panel__row">
                  <span className="info-panel__label">Cônjuge</span>
                  <span className="info-panel__value">{conjugeNome}</span>
                </div>
              )}
              {filhosNomes.length > 0 && (
                <div className="info-panel__row">
                  <span className="info-panel__label">Filhos</span>
                  <span className="info-panel__value">{filhosNomes.join(', ')}</span>
                </div>
              )}
              {!paiNome && !maeNome && !conjugeNome && filhosNomes.length === 0 && (
                <div className="info-panel__row">
                  <span className="info-panel__value" style={{ color: 'var(--clr-text-muted)', fontStyle: 'italic' }}>
                    Nenhuma relação cadastrada.
                  </span>
                </div>
              )}
            </div>
            <div className="info-panel__actions">
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

        {/* ── Legend ── */}
        <div className="app__legend">
          <div className="legend__title">Legenda</div>
          <div className="legend__item"><div className="legend__dot" style={{ background: '#3b5bdb' }} /><span>Fundadores</span></div>
          <div className="legend__item"><div className="legend__dot" style={{ background: '#0ca678' }} /><span>1ª geração</span></div>
          <div className="legend__item"><div className="legend__dot" style={{ background: '#e67700' }} /><span>2ª geração</span></div>
          <div className="legend__item"><div className="legend__dot" style={{ background: '#ae3ec9' }} /><span>3ª+ geração</span></div>
        </div>

        {/* ── Indicador de sync ── */}
        <div className="app__sync-badge">
          <span className="app__sync-dot" />
          Supabase
        </div>
      </main>

      {/* ── Toasts ── */}
      {(importError || syncError) && (
        <p className="app__error" role="alert">{importError || syncError}</p>
      )}

      {/* ── Modais ── */}
      {showAdd && (
        <PersonEditor person={null} people={people} onSave={handleSavePerson} onCancel={() => setShowAdd(false)} isNew />
      )}
      {editingPerson && (
        <PersonEditor person={editingPerson} people={people} onSave={handleSavePerson} onCancel={() => setEditingId(null)} isNew={false} />
      )}
    </div>
  )
}
