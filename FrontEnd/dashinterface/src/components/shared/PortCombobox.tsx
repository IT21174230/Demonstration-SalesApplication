/**
 * Two-tier port autocomplete.
 *
 * Tier 1 — curated list of ~40 frequent Colombo-export ports shown as a searchable dropdown.
 *   Matches on UNLOCODE code or city/country label. Always valid.
 *   Accepts "Port/Country" slash format as well as comma format while filtering.
 *
 * Tier 2 — full UN/LOCODE database (public/ports.json, 99k+ entries) used as a fallback
 *   validator when the user types something not in the curated list.
 *   Accepted input formats:
 *     • UNLOCODE:    "NLRTM" → Rotterdam/Netherlands
 *     • Slash style: "Rotterdam/Netherlands" → NLRTM (reverse value lookup)
 *     • Any mix of slashes, commas and spaces is normalised for comparison.
 *   Fetched lazily on first need; UNLOCODE→label and label→UNLOCODE caches held in module scope.
 *
 * Only the 5-character UNLOCODE is sent to the parent via onChange.
 * When input is invalid, similar curated suggestions are shown inline.
 */

import { useState, useRef, useEffect } from 'react'

// ---------------------------------------------------------------------------
// Curated port list
// ---------------------------------------------------------------------------

interface CuratedPort {
  code: string   // 5-char UN/LOCODE
  label: string  // "City, Country" for display
}

const CURATED_PORTS: CuratedPort[] = [
  // Sri Lanka
  { code: 'LKCMB', label: 'Colombo, Sri Lanka' },
  // Middle East
  { code: 'AEJEA', label: 'Jebel Ali, UAE' },
  { code: 'OMSLL', label: 'Salalah, Oman' },
  { code: 'QAHMD', label: 'Hamad Port, Qatar' },
  // Southeast Asia
  { code: 'SGSIN', label: 'Singapore' },
  { code: 'MYPKG', label: 'Port Klang, Malaysia' },
  // India
  { code: 'INNSA', label: 'Nhava Sheva, India' },
  { code: 'INMAA', label: 'Chennai, India' },
  { code: 'INMUN', label: 'Mundra, India' },
  // Europe
  { code: 'NLRTM', label: 'Rotterdam, Netherlands' },
  { code: 'DEHAM', label: 'Hamburg, Germany' },
  { code: 'BEANR', label: 'Antwerp, Belgium' },
  { code: 'GBFXT', label: 'Felixstowe, UK' },
  { code: 'FRLEH', label: 'Le Havre, France' },
  { code: 'ESBCN', label: 'Barcelona, Spain' },
  { code: 'ITGOA', label: 'Genova, Italy' },
  { code: 'GRPIR', label: 'Piraeus, Greece' },
  // China
  { code: 'CNSHA', label: 'Shanghai, China' },
  { code: 'CNNGB', label: 'Ningbo, China' },
  { code: 'CNTAO', label: 'Qingdao, China' },
  { code: 'CNYTN', label: 'Yantian (Shenzhen), China' },
  // Northeast Asia
  { code: 'HKHKG', label: 'Hong Kong' },
  { code: 'TWKHH', label: 'Kaohsiung, Taiwan' },
  { code: 'KRPUS', label: 'Busan, South Korea' },
  { code: 'JPTYO', label: 'Tokyo, Japan' },
  { code: 'JPOSA', label: 'Osaka, Japan' },
  { code: 'JPNGO', label: 'Nagoya, Japan' },
  // USA (standard UN/LOCODEs — absent from ports.json but authoritative)
  { code: 'USLAX', label: 'Los Angeles, USA' },
  { code: 'USLGB', label: 'Long Beach, USA' },
  { code: 'USNYC', label: 'New York, USA' },
  { code: 'USSAV', label: 'Savannah, USA' },
  { code: 'USHOU', label: 'Houston, USA' },
  { code: 'USSEA', label: 'Seattle, USA' },
  // Canada
  { code: 'CAVAN', label: 'Vancouver, Canada' },
  { code: 'CAMTR', label: 'Montreal, Canada' },
  // Oceania
  { code: 'AUMEL', label: 'Melbourne, Australia' },
  { code: 'AUSYD', label: 'Sydney, Australia' },
  { code: 'AUBNE', label: 'Brisbane, Australia' },
  { code: 'NZAKL', label: 'Auckland, New Zealand' },
  // Africa
  { code: 'KEMBA', label: 'Mombasa, Kenya' },
  { code: 'ZADUR', label: 'Durban, South Africa' },
]

// ---------------------------------------------------------------------------
// Full ports.json — fetched lazily, cached in module scope
// ---------------------------------------------------------------------------

let fullPortsCache: Record<string, string> | null = null
// Reverse map: normalised label → UNLOCODE (built once from fullPortsCache)
let reversePortsCache: Map<string, string> | null = null

async function getFullPorts(): Promise<Record<string, string>> {
  if (fullPortsCache) return fullPortsCache
  const res = await fetch('/ports.json')
  if (!res.ok) throw new Error('ports.json not available')
  fullPortsCache = (await res.json()) as Record<string, string>
  return fullPortsCache
}

async function getReversePorts(): Promise<Map<string, string>> {
  if (reversePortsCache) return reversePortsCache
  const allPorts = await getFullPorts()
  reversePortsCache = new Map()
  for (const [code, label] of Object.entries(allPorts)) {
    reversePortsCache.set(normPort(label), code)
  }
  return reversePortsCache
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a port label for loose comparison.
 * Treats "/", "," and whitespace as equivalent separators.
 * "Rotterdam/Netherlands", "Rotterdam, Netherlands", "Rotterdam Netherlands"
 * all normalise to "rotterdam netherlands".
 */
function normPort(s: string): string {
  return s.toLowerCase().replace(/[\/,]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function curatedLabel(code: string): string | undefined {
  return CURATED_PORTS.find(p => p.code === code)?.label
}

function filterCurated(query: string): CuratedPort[] {
  const q = query.toLowerCase().trim()
  if (!q) return CURATED_PORTS
  const qNorm = normPort(q)
  return CURATED_PORTS.filter(p => {
    const code = p.code.toLowerCase()
    const label = p.label.toLowerCase()
    return code.includes(q) || label.includes(q) || normPort(p.label).includes(qNorm)
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Validation =
  | { status: 'idle' }
  | { status: 'validating' }
  | { status: 'valid'; label: string }
  | { status: 'invalid'; similar: CuratedPort[] }

interface PortComboboxProps {
  value: string
  onChange: (code: string) => void
  placeholder?: string
  id?: string
  style?: React.CSSProperties
}

export default function PortCombobox({ value, onChange, placeholder, id, style }: PortComboboxProps) {
  // inputText is what shows in the <input>:
  //   - While searching: raw query (e.g. "hamb")
  //   - When committed: "CODE — Label" (e.g. "DEHAM — Hamburg, Germany")
  const [inputText, setInputText] = useState<string>(() => {
    if (!value) return ''
    const lbl = curatedLabel(value)
    return lbl ? `${value} — ${lbl}` : value
  })
  const [isOpen, setIsOpen] = useState(false)
  const [validation, setValidation] = useState<Validation>({ status: 'idle' })

  const isFocusedRef = useRef(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Sync external value changes (e.g., form reset) into display, but don't
  // override the user's live input while they're focused.
  useEffect(() => {
    if (isFocusedRef.current) return
    if (!value) {
      setInputText('')
      setValidation({ status: 'idle' })
    } else {
      const lbl = curatedLabel(value)
      setInputText(lbl ? `${value} — ${lbl}` : value)
      if (lbl) setValidation({ status: 'valid', label: lbl })
    }
  }, [value])

  // Derive the search token from the input text.
  // "DEHAM — Hamburg, Germany" → search by "DEHAM" (the code portion before " — ")
  const searchQuery = inputText.includes(' — ') ? inputText.split(' — ')[0] : inputText
  const suggestions = filterCurated(searchQuery)

  function commitPort(port: CuratedPort) {
    setInputText(`${port.code} — ${port.label}`)
    setValidation({ status: 'valid', label: port.label })
    setIsOpen(false)
    onChange(port.code)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value
    setInputText(text)
    setValidation({ status: 'idle' })
    setIsOpen(true)

    if (!text.trim()) {
      onChange('')
      return
    }

    // Auto-commit if the user typed an exact curated UNLOCODE
    const exact = CURATED_PORTS.find(p => p.code === text.trim().toUpperCase())
    if (exact) commitPort(exact)
  }

  function handleFocus() {
    isFocusedRef.current = true
    setIsOpen(true)
  }

  async function handleBlur() {
    isFocusedRef.current = false
    // Allow mousedown on dropdown items to register before closing
    await new Promise<void>(r => setTimeout(r, 160))
    setIsOpen(false)

    const raw = inputText.trim()
    if (!raw || validation.status === 'valid') return

    // 1. Extract leading token as a potential UNLOCODE (letters/digits only)
    const potentialCode = raw.split(/[\s—\-]+/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '')

    // 2. Check curated list by code
    const curatedByCode = CURATED_PORTS.find(p => p.code === potentialCode)
    if (curatedByCode) { commitPort(curatedByCode); return }

    // 3. Check curated list by label using normalised comparison
    //    Accepts "Colombo/Sri Lanka", "Colombo, Sri Lanka", "colombo sri lanka", etc.
    const rawNorm = normPort(raw)
    const curatedByLabel = CURATED_PORTS.find(p => normPort(p.label) === rawNorm)
    if (curatedByLabel) { commitPort(curatedByLabel); return }

    if (raw.length < 3) return

    // 4. Validate against full ports.json
    setValidation({ status: 'validating' })
    try {
      const allPorts = await getFullPorts()

      // 4a. Try as UNLOCODE key (e.g. "NLRTM")
      if (potentialCode.length >= 3) {
        const lbl = allPorts[potentialCode]
        if (lbl) {
          setInputText(`${potentialCode} — ${lbl}`)
          setValidation({ status: 'valid', label: lbl })
          onChange(potentialCode)
          return
        }
      }

      // 4b. Try as Port/Country value (e.g. "Rotterdam/Netherlands").
      //     Uses the reverse map (built once, then cached) for O(1) lookup.
      const reverseMap = await getReversePorts()
      const codeFromLabel = reverseMap.get(rawNorm)
      if (codeFromLabel) {
        const portLabel = allPorts[codeFromLabel]
        setInputText(`${codeFromLabel} — ${portLabel}`)
        setValidation({ status: 'valid', label: portLabel })
        onChange(codeFromLabel)
        return
      }

      // 4c. Not found — show similar curated suggestions
      const words = raw.toLowerCase().split(/[\s\/,]+/).filter(w => w.length >= 2)
      const similar = CURATED_PORTS.filter(p =>
        words.some(w => p.code.toLowerCase().includes(w) || normPort(p.label).includes(w))
      ).slice(0, 5)
      setValidation({ status: 'invalid', similar })
      onChange('')
    } catch {
      // ports.json unavailable — pass a 5-char alphanumeric token through as-is
      if (potentialCode.length === 5) onChange(potentialCode)
      setValidation({ status: 'idle' })
    }
  }

  // Close dropdown on outside click
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
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder ?? 'Type port name or UNLOCODE'}
        autoComplete="off"
        spellCheck={false}
      />

      {validation.status === 'validating' && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
          Checking port...
        </div>
      )}
      {validation.status === 'valid' && (
        <div style={{ fontSize: 11, color: '#16a34a', marginTop: 3 }}>
          ✓ {validation.label}
        </div>
      )}
      {validation.status === 'invalid' && (
        <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3 }}>
          Port not recognised.
          {validation.similar.length > 0 && (
            <> Did you mean:{' '}
              {validation.similar.map((p, i) => (
                <span key={p.code}>
                  <button
                    type="button"
                    style={{
                      background: 'none', border: 'none', color: '#2563eb',
                      cursor: 'pointer', fontSize: 11, padding: 0, textDecoration: 'underline',
                    }}
                    onMouseDown={e => { e.preventDefault(); commitPort(p) }}
                  >
                    {p.code}
                  </button>
                  {i < validation.similar.length - 1 ? ', ' : ''}
                </span>
              ))}
            </>
          )}
        </div>
      )}

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
            maxHeight: 240,
            overflowY: 'auto',
          }}
        >
          {suggestions.map(port => (
            <div
              key={port.code}
              onMouseDown={e => { e.preventDefault(); commitPort(port) }}
              style={{
                padding: '7px 12px',
                cursor: 'pointer',
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-card, #fff)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg, #f8fafc)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-card, #fff)' }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--primary, #2563eb)', minWidth: 50 }}>
                {port.code}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{port.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
