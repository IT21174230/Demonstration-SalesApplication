/**
 * Generic searchable dropdown combobox.
 *
 * Shows all items when focused; narrows as the user types (matches on label
 * and sublabel). Selecting an item writes item.label into the input and
 * calls onChange with item.label.
 *
 * Used for Customer Name and Contact Person fields in New Inquiry.
 */

import { useState, useRef, useEffect } from 'react'

export interface SearchItem {
  label: string       // Primary text shown in dropdown and placed in input on select
  sublabel?: string   // Secondary info (e.g. city, email) shown below label in dropdown
}

interface SearchComboboxProps {
  items: SearchItem[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  id?: string
  style?: React.CSSProperties
  autoFocus?: boolean
}

function filterItems(items: SearchItem[], query: string): SearchItem[] {
  const q = query.toLowerCase().trim()
  if (!q) return items
  return items.filter(
    item =>
      item.label.toLowerCase().includes(q) ||
      (item.sublabel?.toLowerCase().includes(q) ?? false)
  )
}

export default function SearchCombobox({
  items, value, onChange, placeholder, id, style, autoFocus,
}: SearchComboboxProps) {
  const [inputText, setInputText] = useState(value)
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const isFocusedRef = useRef(false)

  // Sync external value changes (e.g. form reset) without clobbering live input
  useEffect(() => {
    if (!isFocusedRef.current) setInputText(value)
  }, [value])

  const suggestions = filterItems(items, inputText)

  function selectItem(item: SearchItem) {
    setInputText(item.label)
    onChange(item.label)
    setIsOpen(false)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value
    setInputText(text)
    onChange(text)
    setIsOpen(true)
  }

  function handleFocus() {
    isFocusedRef.current = true
    setIsOpen(true)
  }

  function handleBlur() {
    isFocusedRef.current = false
    setTimeout(() => setIsOpen(false), 150)
  }

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={wrapperRef} style={{ position: 'relative', ...style }}>
      <input
        id={id}
        className="lt-input"
        style={{ width: '100%' }}
        value={inputText}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
      />

      {isOpen && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 2px)',
            left: 0,
            right: 0,
            background: 'var(--bg-card, #fff)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
            zIndex: 1000,
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {suggestions.map((item, i) => (
            <div
              key={`${i}-${item.label}`}
              onMouseDown={e => { e.preventDefault(); selectItem(item) }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-card, #fff)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg, #f8fafc)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-card, #fff)' }}
            >
              <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                {item.label}
              </span>
              {item.sublabel && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {item.sublabel}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
