import { useState, useEffect } from 'react'
import './PersonEditor.css'

const EMPTY_PERSON = {
  id: '',
  nome: '',
  pai: null,
  mae: null,
  conjuge: null,
  filhos: [],
}

function SearchSelect({ id, value, onChange, options, placeholder }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(query.toLowerCase())
  )
  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  return (
    <div className="search-select" onBlur={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
    }}>
      <button
        type="button"
        id={id}
        className="search-select__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? selected.label : <span className="search-select__placeholder">{placeholder}</span>}
        <span className="search-select__chevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="search-select__dropdown" role="listbox">
          <div className="search-select__search">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              autoFocus
            />
          </div>
          <div className="search-select__list">
            <button
              type="button"
              className="search-select__option search-select__option--none"
              onClick={() => { onChange(null); setOpen(false) }}
              role="option"
              aria-selected={!value}
            >
              — Nenhum(a) —
            </button>
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`search-select__option ${o.value === value ? 'search-select__option--active' : ''}`}
                onClick={() => { onChange(o.value); setOpen(false) }}
                role="option"
                aria-selected={o.value === value}
              >
                {o.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="search-select__empty">Nenhum resultado</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function PersonEditor({ person, people, onSave, onCancel, onDelete, isNew }) {
  const [form, setForm] = useState(EMPTY_PERSON)
  const [filhosSearch, setFilhosSearch] = useState('')
  const [visible, setVisible] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  useEffect(() => {
    if (person) {
      setForm({
        id: person.id || '',
        nome: person.nome || '',
        pai: person.pai ?? null,
        mae: person.mae ?? null,
        conjuge: person.conjuge ?? null,
        filhos: Array.isArray(person.filhos) ? [...person.filhos] : [],
      })
    } else {
      setForm({ ...EMPTY_PERSON, id: isNew ? `p-${Date.now()}` : '' })
    }
  }, [person, isNew])

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleFilhosChange = (childId, checked) => {
    setForm((prev) => {
      const filhos = checked
        ? [...(prev.filhos || []), childId].filter(Boolean)
        : (prev.filhos || []).filter((id) => id !== childId)
      return { ...prev, filhos }
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...form,
      pai: form.pai || null,
      mae: form.mae || null,
      conjuge: form.conjuge || null,
      filhos: form.filhos || [],
    })
  }

  const handleClose = () => {
    setVisible(false)
    setTimeout(onCancel, 200)
  }

  const others = people.filter((p) => p.id && p.id !== form.id)
  const selectOptions = others.map((p) => ({ value: p.id, label: p.nome }))

  const filteredFilhos = others.filter((p) =>
    p.nome.toLowerCase().includes(filhosSearch.toLowerCase())
  )
  const selectedFilhosCount = (form.filhos || []).length

  return (
    <div
      className={`pe-overlay ${visible ? 'pe-overlay--visible' : ''}`}
      onClick={handleClose}
    >
      <aside
        className={`pe-drawer ${visible ? 'pe-drawer--visible' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="pe-drawer__header">
          <div>
            <h2 className="pe-drawer__title">
              {isNew ? '+ Nova pessoa' : '✏️ Editar pessoa'}
            </h2>
            {!isNew && person && (
              <p className="pe-drawer__subtitle">{person.nome}</p>
            )}
          </div>
          <button type="button" className="pe-drawer__close" onClick={handleClose} aria-label="Fechar">
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="pe-drawer__form">
          <div className="pe-section">
            <div className="pe-section__title">Informações básicas</div>

            <div className="pe-field">
              <label htmlFor="pe-nome" className="pe-label">Nome completo</label>
              <input
                id="pe-nome"
                type="text"
                className="pe-input"
                value={form.nome}
                onChange={(e) => handleChange('nome', e.target.value)}
                placeholder="Ex: João da Silva"
                required
                autoFocus
              />
            </div>

            {isNew && (
              <div className="pe-field">
                <label htmlFor="pe-id" className="pe-label">
                  ID único
                  <span className="pe-label__hint">usado internamente</span>
                </label>
                <input
                  id="pe-id"
                  type="text"
                  className="pe-input"
                  value={form.id}
                  onChange={(e) => handleChange('id', e.target.value)}
                  placeholder="ex: joao-silva"
                  required
                />
              </div>
            )}
          </div>

          <div className="pe-section">
            <div className="pe-section__title">Relações</div>

            <div className="pe-field">
              <label htmlFor="pe-pai" className="pe-label">Pai</label>
              <SearchSelect
                id="pe-pai"
                value={form.pai}
                onChange={(v) => handleChange('pai', v)}
                options={selectOptions}
                placeholder="— Selecionar pai —"
              />
            </div>

            <div className="pe-field">
              <label htmlFor="pe-mae" className="pe-label">Mãe</label>
              <SearchSelect
                id="pe-mae"
                value={form.mae}
                onChange={(v) => handleChange('mae', v)}
                options={selectOptions}
                placeholder="— Selecionar mãe —"
              />
            </div>

            <div className="pe-field">
              <label htmlFor="pe-conjuge" className="pe-label">Cônjuge</label>
              <SearchSelect
                id="pe-conjuge"
                value={form.conjuge}
                onChange={(v) => handleChange('conjuge', v)}
                options={selectOptions}
                placeholder="— Selecionar cônjuge —"
              />
            </div>
          </div>

          <div className="pe-section">
            <div className="pe-section__title">
              Filhos
              {selectedFilhosCount > 0 && (
                <span className="pe-section__count">{selectedFilhosCount} selecionado{selectedFilhosCount > 1 ? 's' : ''}</span>
              )}
            </div>

            <div className="pe-field">
              <input
                type="text"
                className="pe-input pe-input--search"
                placeholder="🔍  Buscar filho…"
                value={filhosSearch}
                onChange={(e) => setFilhosSearch(e.target.value)}
              />
            </div>

            <div className="pe-filhos">
              {filteredFilhos.length === 0 ? (
                <span className="pe-filhos__empty">
                  {filhosSearch ? 'Nenhum resultado.' : 'Nenhuma pessoa cadastrada.'}
                </span>
              ) : (
                filteredFilhos.map((p) => {
                  const checked = (form.filhos || []).includes(p.id)
                  return (
                    <label
                      key={p.id}
                      className={`pe-filhos__item ${checked ? 'pe-filhos__item--checked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => handleFilhosChange(p.id, e.target.checked)}
                        className="pe-filhos__checkbox"
                      />
                      <span className="pe-filhos__name">{p.nome}</span>
                      {checked && <span className="pe-filhos__check">✓</span>}
                    </label>
                  )
                })
              )}
            </div>
          </div>

          <div className="pe-drawer__footer">
            {!isNew && onDelete && (
              confirmDelete ? (
                <div className="pe-delete-confirm">
                  <span>Excluir permanentemente?</span>
                  <button type="button" className="btn btn--danger pe-btn" onClick={() => onDelete(form.id)}>
                    Confirmar
                  </button>
                  <button type="button" className="btn btn--ghost pe-btn" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <button type="button" className="btn btn--danger-ghost pe-btn pe-btn--delete" onClick={() => setConfirmDelete(true)}>
                  Excluir
                </button>
              )
            )}
            {!confirmDelete && (
              <>
                <button type="button" onClick={handleClose} className="btn btn--ghost pe-btn">
                  Cancelar
                </button>
                <button type="submit" className="btn btn--primary pe-btn">
                  {isNew ? '+ Adicionar' : '✓ Salvar alterações'}
                </button>
              </>
            )}
          </div>
        </form>
      </aside>
    </div>
  )
}

export default PersonEditor
