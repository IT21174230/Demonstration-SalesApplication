import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'

interface TagInputProps {
  values: string[]
  onChange: (values: string[]) => void
  suggestions: string[]
  placeholder?: string
}

export default function TagInput({ values, onChange, suggestions, placeholder }: TagInputProps) {
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = input.trim()
    ? suggestions.filter(s =>
        s.toLowerCase().includes(input.toLowerCase()) &&
        !values.some(v => v.toLowerCase() === s.toLowerCase())
      )
    : suggestions.filter(s => !values.some(v => v.toLowerCase() === s.toLowerCase()))

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const addValue = (val: string) => {
    const trimmed = val.trim()
    if (!trimmed || values.some(v => v.toLowerCase() === trimmed.toLowerCase())) return
    onChange([...values, trimmed])
    setInput('')
    setHighlightIdx(-1)
    inputRef.current?.focus()
  }

  const removeValue = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx))
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setShowSuggestions(true)
      setHighlightIdx(prev => Math.min(prev + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIdx >= 0 && highlightIdx < filtered.length) {
        addValue(filtered[highlightIdx])
      } else if (input.trim()) {
        addValue(input)
      }
    } else if (e.key === 'Backspace' && !input && values.length > 0) {
      removeValue(values.length - 1)
    }
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
          padding: '4px 8px', minHeight: 36,
          border: '1px solid var(--border)', borderRadius: 8,
          background: 'var(--card)', cursor: 'text',
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((v, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 8px', fontSize: 11, fontWeight: 600,
            background: 'var(--accent-bg, rgba(59,130,246,0.08))',
            color: 'var(--accent, #3b82f6)',
            borderRadius: 12, whiteSpace: 'nowrap',
          }}>
            {v}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); removeValue(i) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 0, display: 'flex', color: 'inherit', opacity: 0.7,
              }}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={e => { setInput(e.target.value); setShowSuggestions(true); setHighlightIdx(-1) }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={onKeyDown}
          placeholder={values.length === 0 ? (placeholder ?? 'Type to search...') : ''}
          style={{
            flex: 1, minWidth: 80, border: 'none', outline: 'none',
            background: 'transparent', fontSize: 12, padding: '4px 0',
            color: 'var(--text)',
          }}
        />
      </div>
      {showSuggestions && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          zIndex: 50, maxHeight: 160, overflowY: 'auto',
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 8, marginTop: 2, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}>
          {filtered.map((s, i) => (
            <div
              key={s}
              onMouseDown={e => { e.preventDefault(); addValue(s); setShowSuggestions(false) }}
              style={{
                padding: '6px 12px', fontSize: 12, cursor: 'pointer',
                background: i === highlightIdx ? 'var(--accent-bg, rgba(59,130,246,0.08))' : 'transparent',
                color: 'var(--text)',
              }}
              onMouseEnter={() => setHighlightIdx(i)}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
