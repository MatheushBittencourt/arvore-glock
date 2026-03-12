import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { uploadToCloudinary, getCloudinaryDownloadUrl } from '../lib/cloudinary.js'
import './DocumentManager.css'

const TYPE_ICONS = {
  'application/pdf': '📄',
  image: '🖼️',
  'application/msword': '📝',
  'application/vnd': '📝',
  default: '📎',
}

function fileIcon(tipo) {
  if (!tipo) return TYPE_ICONS.default
  if (tipo.includes('pdf')) return TYPE_ICONS['application/pdf']
  if (tipo.startsWith('image')) return TYPE_ICONS.image
  if (tipo.includes('word') || tipo.includes('doc')) return TYPE_ICONS['application/msword']
  if (tipo.includes('vnd')) return TYPE_ICONS['application/vnd']
  return TYPE_ICONS.default
}

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR')
}

export default function DocumentManager({ pessoaId, pessoaNome }) {
  const [docs, setDocs]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [error, setError]         = useState(null)
  const [deleting, setDeleting]   = useState(null)
  const fileInputRef              = useRef(null)

  useEffect(() => {
    if (!pessoaId) return
    loadDocs()
  }, [pessoaId])

  async function loadDocs() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('documentos')
        .select('*')
        .eq('pessoa_id', pessoaId)
        .order('criado_em', { ascending: false })
      if (error) throw error
      setDocs(data || [])
    } catch (e) {
      setError('Erro ao carregar documentos.')
    } finally {
      setLoading(false)
    }
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    // Valida tamanho antes de enviar (limite 10MB do Cloudinary free)
    const MAX_MB = 10
    const tooBig = files.filter(f => f.size > MAX_MB * 1024 * 1024)
    if (tooBig.length) {
      setError(`Arquivo(s) muito grande(s): ${tooBig.map(f => f.name).join(', ')}. Limite máximo: ${MAX_MB}MB por arquivo.`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setError(null)
    setUploading(true)
    setProgress(0)

    try {
      for (const file of files) {
        const result = await uploadToCloudinary(file, setProgress)
        const { error } = await supabase.from('documentos').insert({
          pessoa_id: pessoaId,
          nome:      file.name,
          tipo:      file.type || result.tipo,
          url:       result.url,
          public_id: result.public_id,
          tamanho:   result.tamanho,
        })
        if (error) throw error
      }
      await loadDocs()
    } catch (e) {
      const msg = e.message || ''
      if (msg.includes('too large') || msg.includes('size')) {
        setError('Arquivo muito grande. O limite é 10MB por arquivo.')
      } else {
        setError('Erro ao enviar documento. Tente novamente.')
      }
    } finally {
      setUploading(false)
      setProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(doc) {
    if (!window.confirm(`Remover "${doc.nome}"?`)) return
    setDeleting(doc.id)
    try {
      const { error } = await supabase.from('documentos').delete().eq('id', doc.id)
      if (error) throw error
      setDocs((prev) => prev.filter((d) => d.id !== doc.id))
    } catch {
      setError('Erro ao remover documento.')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="dm">
      <div className="dm__header">
        <span className="dm__title">📎 Documentos</span>
        <label className={`btn btn--ghost dm__upload-btn ${uploading ? 'dm__upload-btn--loading' : ''}`}>
          {uploading ? `Enviando ${progress}%…` : '+ Anexar'}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.heic,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleUpload}
            disabled={uploading}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {uploading && (
        <div className="dm__progress-bar">
          <div className="dm__progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      {error && <p className="dm__error">{error}</p>}

      {loading ? (
        <div className="dm__loading">Carregando…</div>
      ) : docs.length === 0 ? (
        <div className="dm__empty">
          <span className="dm__empty-icon">📂</span>
          <span>Nenhum documento anexado.</span>
          <span className="dm__empty-hint">Certidões, fotos, documentos…</span>
        </div>
      ) : (
        <ul className="dm__list">
          {docs.map((doc) => (
            <li key={doc.id} className="dm__item">
              <span className="dm__item-icon">{fileIcon(doc.tipo)}</span>
              <div className="dm__item-info">
                <span className="dm__item-name" title={doc.nome}>{doc.nome}</span>
                <span className="dm__item-meta">
                  {[formatBytes(doc.tamanho), formatDate(doc.criado_em)].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="dm__item-actions">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dm__action-btn"
                  title="Visualizar"
                >
                  👁
                </a>
                <a
                  href={getCloudinaryDownloadUrl(doc.url)}
                  download={doc.nome}
                  className="dm__action-btn"
                  title="Baixar"
                >
                  ⬇
                </a>
                <button
                  type="button"
                  className="dm__action-btn dm__action-btn--delete"
                  onClick={() => handleDelete(doc)}
                  disabled={deleting === doc.id}
                  title="Remover"
                >
                  {deleting === doc.id ? '…' : '✕'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
