import { useState, useRef, useEffect } from 'react'
import './SearchBar.css'

function SearchBar({ people, onSelect }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  const results = query.trim().length >= 1
    ? people
        .filter((p) => p.nome.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8)
    : []

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
      if (e.key === 'Escape') {
        setOpen(false)
        setQuery('')
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    function onClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function handleSelect(person) {
    onSelect(person)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <div className="search-bar" ref={containerRef}>
      <div className="search-bar__field">
        <span className="search-bar__icon">🔍</span>
        <input
          ref={inputRef}
          type="text"
          className="search-bar__input"
          placeholder="Buscar pessoa…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
        {query && (
          <button
            type="button"
            className="search-bar__clear"
            onClick={() => { setQuery(''); inputRef.current?.focus() }}
          >
            ✕
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="search-bar__dropdown">
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              className="search-bar__result"
              onClick={() => handleSelect(p)}
            >
              <div className="search-bar__result-avatar">
                {getInitials(p.nome)}
              </div>
              <div className="search-bar__result-info">
                <span className="search-bar__result-name">{highlightMatch(p.nome, query)}</span>
                <span className="search-bar__result-meta">
                  {[p.filhos?.length > 0 && `${p.filhos.length} filho(s)`, p.conjuge && '💍 casado(a)']
                    .filter(Boolean).join(' · ')}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && query.trim().length >= 1 && results.length === 0 && (
        <div className="search-bar__dropdown">
          <div className="search-bar__no-results">Nenhuma pessoa encontrada</div>
        </div>
      )}
    </div>
  )
}

function getInitials(nome) {
  const parts = nome.split(' ').filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function highlightMatch(text, query) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export default SearchBar
