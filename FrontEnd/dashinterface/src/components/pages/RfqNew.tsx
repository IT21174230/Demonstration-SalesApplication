import { useState } from 'react'
import { Plus, Trash2, Upload, FileSpreadsheet } from 'lucide-react'
import PortCombobox from '../shared/PortCombobox'
import SearchCombobox from '../shared/SearchCombobox'
import { CONTAINER_TYPES, type ClientRecord, type ContainerType } from '../../types'
import { apiCreateRfq, apiPreviewRfq, type RfqLinePayload } from '../../api'

interface Row { origin: string; destination: string; containerType: ContainerType; qty: number }

const blankRow = (origin = ''): Row => ({
  origin, destination: '', containerType: '40 HC', qty: 1,
})

// backend expects codes like 40HC, the UI shows "40 HC"
const toBackendType = (t: string) => t.replace(/\s+/g, '')

interface Props {
  clientList: ClientRecord[]
  onFlash: (msg: string) => void
  onGoBack: () => void
}

export default function RfqNew({ clientList, onFlash, onGoBack }: Props) {
  const [customer, setCustomer] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [rows, setRows] = useState<Row[]>([blankRow()])
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  
  const [destination, setDestination] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadNote, setUploadNote] = useState('')

  // Read a tender spreadsheet and fill the routes table. Saves nothing.
  const handleFile = async (file: File) => {
    setUploading(true)
    setUploadNote('')
    try {
      const res = await apiPreviewRfq(file)
      if (res.rows.length === 0) {
        onFlash('No routes found in that file')
        return
      }
      setRows(res.rows.map(r => ({
        origin: r.origin_code || r.origin || '',
        destination: r.destination_code || r.destination || (res.destination ?? ''),
        containerType: '40 HC' as ContainerType,
        qty: 1,
      })))
      if (res.destination) setDestination(res.destination)
      const bits = [`${res.rows.length} routes loaded`]
      if (res.unknown_count) bits.push(`${res.unknown_count} unrecognised port code(s)`)
      if (res.skipped.length) bits.push(`${res.skipped.length} row(s) skipped`)
      setUploadNote(bits.join(' · '))
      onFlash(bits.join(' · '))
    } catch (e) {
      onFlash(`Could not read the file: ${(e as Error).message}`)
    } finally {
      setUploading(false)
    }
  }

  // Apply the destination box to every row
  const fillDestination = () => {
    if (destination.trim()) {
      setRows(prev => prev.map(r => ({ ...r, destination: destination.trim().toUpperCase() })))
    }
  }

  const matchedCli = clientList.find(
    c => c.name.trim().toLowerCase() === customer.trim().toLowerCase()
  ) ?? null

  const update = (i: number, patch: Partial<Row>) =>
    setRows(prev => prev.map((r, x) => (x === i ? { ...r, ...patch } : r)))

  // Copy row 1's origin into every row — tenders usually share one origin
  const fillOrigin = () => {
    const o = rows[0]?.origin
    if (o) setRows(prev => prev.map(r => ({ ...r, origin: o })))
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!matchedCli) e.customer = 'Pick an existing customer from the list'
    if (!contactName.trim()) e.contact = 'Contact person is required'
    if (rows.length === 0) e.rows = 'Add at least one route'
    rows.forEach((r, i) => {
      const CODE = /^[A-Z]{2}[A-Z0-9]{3}$/
      const o = r.origin.trim().toUpperCase()
      const d = r.destination.trim().toUpperCase()

      if (!o) e[`r${i}.origin`] = 'Required'
      else if (!CODE.test(o)) e[`r${i}.origin`] = `"${r.origin}" is not a port code — pick one`

      if (!d) e[`r${i}.destination`] = 'Required'
      else if (!CODE.test(d)) e[`r${i}.destination`] = `"${r.destination}" is not a port code — pick one`
      else if (d === o) e[`r${i}.destination`] = 'Same as origin'
      if (!r.qty || r.qty < 1) e[`r${i}.qty`] = 'Must be 1 or more'
    })
    return e
  }

  const save = async () => {
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) {
      onFlash(`Please fix ${Object.keys(found).length} field(s)`)
      return
    }
    setSaving(true)
    try {
      const lines: RfqLinePayload[] = rows.map(r => ({
        inquiry: { origin: r.origin.trim().toUpperCase(), service_mode: 'PORT_TO_PORT' },
        commodities: [{ com_type: 'General' }],
        containers: [{
          commodity_index: 0,
          container_type: toBackendType(r.containerType),
          qty: r.qty,
          destination: r.destination.trim().toUpperCase(),
        }],
      }))
      const res = await apiCreateRfq({
        cli_id: matchedCli!.cli_id,
        contact: { name: contactName.trim(), email: contactEmail.trim() || undefined },
        lines,
      })
      onFlash(`RFQ-${res.rfq_ref} created — ${res.line_count} routes`)
      onGoBack()
    } catch (err) {
      onFlash(`Failed: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  const Err = ({ k }: { k: string }) =>
    errors[k] ? <div style={{ color: '#dc2626', fontSize: 11, marginTop: 3 }}>{errors[k]}</div> : null

  return (
    <div className="db-page-anim">
      <div className="db-page-head">
        <h1 className="db-page-title">New RFQ</h1>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          One customer, many routes. Each route becomes its own inquiry.
        </div>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>


      {/* Upload a tender spreadsheet */}
        <div style={{
          border: '1px dashed var(--border)', borderRadius: 10,
          padding: '14px 16px', marginBottom: 20, display: 'flex',
          alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}>
          <FileSpreadsheet size={18} style={{ color: 'var(--accent)' }} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>Upload tender spreadsheet</div>
          <input
            type="file"
            accept=".xlsx,.xls"
            disabled={uploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
            style={{ fontSize: 12 }}
          />
          {uploading && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Reading…</span>}
          {uploadNote && <span style={{ fontSize: 12, color: 'var(--accent)' }}>{uploadNote}</span>}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <label className="lt-label" style={{ margin: 0 }}>Destination</label>
            <div style={{ width: 200 }}>
              <PortCombobox value={destination} onChange={setDestination} placeholder="e.g. Hamburg" />
            </div>
            <button className="db-btn" style={{ fontSize: 12 }} onClick={fillDestination}>
              Apply to all
            </button>
          </div>
        </div>

        {/* Customer + contact */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 22 }}>
          <div>
            <label className="lt-label">
              Customer <span style={{ color: '#dc2626' }}>*</span>
              {matchedCli && <span style={{ marginLeft: 8, fontSize: 11, color: '#16a34a', fontWeight: 500 }}>✓ found</span>}
            </label>
            <SearchCombobox
              value={customer}
              onChange={setCustomer}
              items={clientList.map(c => ({ label: c.name, sublabel: c.city ?? undefined }))}
              placeholder="Type or select customer"
            />
            <Err k="customer" />
          </div>
          <div>
            <label className="lt-label">Contact Person <span style={{ color: '#dc2626' }}>*</span></label>
            <input className="lt-input" style={{ width: '100%' }} value={contactName}
                   onChange={e => setContactName(e.target.value)} maxLength={100} placeholder="e.g. John Silva" />
            <Err k="contact" />
          </div>
          <div>
            <label className="lt-label">Contact Email</label>
            <input className="lt-input" style={{ width: '100%' }} value={contactEmail}
                   onChange={e => setContactEmail(e.target.value)} maxLength={120} placeholder="e.g. john@acme.com" />
          </div>
        </div>

        {/* Routes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <strong style={{ fontSize: 14 }}>Routes ({rows.length})</strong>
          <button className="db-btn" style={{ fontSize: 12 }} onClick={fillOrigin}>
            Copy origin to all
          </button>
          <button className="db-btn" style={{ fontSize: 12, marginLeft: 'auto' }}
                  onClick={() => setRows(p => [...p, blankRow(p[0]?.origin ?? '')])}>
            <Plus size={13} /> Add route
          </button>
        </div>
        <Err k="rows" />

        {rows.map((r, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 150px 90px 36px',
            gap: 10, alignItems: 'start', padding: '10px 6px',
            borderBottom: '1px solid var(--border)',
            background: (
              (r.origin.trim() !== '' && !/^[A-Z]{2}[A-Z0-9]{3}$/.test(r.origin.trim().toUpperCase())) ||
              (r.destination.trim() !== '' && !/^[A-Z]{2}[A-Z0-9]{3}$/.test(r.destination.trim().toUpperCase()))
            ) ? 'rgba(220,38,38,0.06)' : undefined,
          }}>
            <div>
              {i === 0 && <label className="lt-label">Origin</label>}
              <PortCombobox value={r.origin} onChange={v => update(i, { origin: v })} placeholder="e.g. Colombo" />
              <Err k={`r${i}.origin`} />
            </div>
            <div>
              {i === 0 && <label className="lt-label">Destination</label>}
              <PortCombobox value={r.destination} onChange={v => update(i, { destination: v })} placeholder="e.g. Hamburg" />
              <Err k={`r${i}.destination`} />
            </div>
            <div>
              {i === 0 && <label className="lt-label">Container</label>}
              <select className="lt-select" style={{ width: '100%' }} value={r.containerType}
                      onChange={e => update(i, { containerType: e.target.value as ContainerType })}>
                {CONTAINER_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
              </select>
            </div>
            <div>
              {i === 0 && <label className="lt-label">Qty</label>}
              <input className="lt-input" type="number" min={1} style={{ width: '100%' }} value={r.qty}
                     onChange={e => update(i, { qty: Math.max(1, Number(e.target.value)) })} />
              <Err k={`r${i}.qty`} />
            </div>
            <div style={{ paddingTop: i === 0 ? 22 : 0 }}>
              <button className="db-btn" title="Remove"
                      onClick={() => setRows(p => p.filter((_, x) => x !== i))}
                      disabled={rows.length === 1}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="db-btn primary" onClick={save} disabled={saving}>
            <Upload size={14} /> {saving ? 'Creating…' : `Create RFQ (${rows.length} routes)`}
          </button>
          <button className="db-btn" onClick={onGoBack}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
