import { useState, useEffect } from 'react'
import { ArrowLeft, Check, DollarSign, FileText, Plus, X } from 'lucide-react'
import {
  RATE_SOURCE_COLORS, portOptions,
  type PortRecord, type LinerRecord, type TradeLaneRecord, type EmployeeRecord, type ClientRecord,
  type RateSourceType,
} from '../../types'
import { apiGetPorts, apiGetLiners, apiGetTradeLanes, apiGetEmployeesDb, apiGetClientsDb, apiCreateTariffRate, apiCreateContractedRate, apiCreateNacRate } from '../../api'
import TagInput from '../shared/TagInput'

interface TariffContainerRate {
  containerType: string
  weight: string
  rate: number | ''
  currency: string
}
const emptyTariffContainer = (): TariffContainerRate => ({ containerType: '', weight: '', rate: '', currency: 'USD' })

interface ContractedContainerRate {
  containerType: string
  contractedVolume: string
  weight: string
  rate: number | ''
  currency: string
}
const emptyContractedContainer = (): ContractedContainerRate => ({ containerType: '', contractedVolume: '', weight: '', rate: '', currency: 'USD' })

interface RecordRateProps {
  onFlash: (msg: string, action?: { label: string; onClick: () => void }) => void
  onGoBack: () => void
}

export default function RecordRate({ onFlash, onGoBack }: RecordRateProps) {
  // Mode: edit form or review summary
  const [mode, setMode] = useState<'edit' | 'review'>('edit')
  // Rate type
  const [rrType, setRrType] = useState<RateSourceType>('Tariff Rate')
  // FK-backed fields
  const [rrLinerId, setRrLinerId] = useState<number | ''>('')
  const [rrTradeLaneId, setRrTradeLaneId] = useState<number | ''>('')
  // Common fields
  const [, setRrContainerType] = useState('')
  const [, setRrRate] = useState<number | ''>('')
  const [, setRrCurrency] = useState('USD')
  const [rrValidFrom, setRrValidFrom] = useState('')
  const [rrValidTo, setRrValidTo] = useState('')
  // Contracted extras
  const [rrContractId, setRrContractId] = useState('')
  const [rrSalesPersonId, setRrSalesPersonId] = useState<number | ''>('')
  const [rrServiceLane, setRrServiceLane] = useState('')
  const [rrOrigin, setRrOrigin] = useState('')
  const [rrDestination, setRrDestination] = useState('')
  const [rrFreeTime, setRrFreeTime] = useState('')
  const [, setRrContainerWeight] = useState('')
  const [, setRrContractedVolume] = useState('')
  const [rrNote, setRrNote] = useState('')
  const [rrSpecialRemark, setRrSpecialRemark] = useState('')
  // Tariff — per-container rates
  const [rrTariffContainers, setRrTariffContainers] = useState<TariffContainerRate[]>([emptyTariffContainer()])
  // Contracted — per-container rates
  const [rrContractedContainers, setRrContractedContainers] = useState<ContractedContainerRate[]>([emptyContractedContainer()])
  // NAC — per-container rates (same shape as Contracted)
  const [rrNacContainers, setRrNacContainers] = useState<ContractedContainerRate[]>([emptyContractedContainer()])
  // NAC extras
  const [rrNacRefNo, setRrNacRefNo] = useState('')
  const [rrNacCustomerName, setRrNacCustomerName] = useState('')
  // Contracted — applicable customers
  const [rrApplicableCustomers, setRrApplicableCustomers] = useState<string[]>([])

  // Reference data
  const [portList, setPortList] = useState<PortRecord[]>([])
  const [linerList, setLinerList] = useState<LinerRecord[]>([])
  const [tradeLaneList, setTradeLaneList] = useState<TradeLaneRecord[]>([])
  const [dbEmployeeList, setDbEmployeeList] = useState<EmployeeRecord[]>([])
  const [dbClientList, setDbClientList] = useState<ClientRecord[]>([])

  useEffect(() => {
    apiGetPorts().then(setPortList).catch(() => {})
    apiGetLiners().then(setLinerList).catch(() => {})
    apiGetTradeLanes().then(setTradeLaneList).catch(() => {})
    apiGetEmployeesDb().then(setDbEmployeeList).catch(() => {})
    apiGetClientsDb().then(setDbClientList).catch(() => {})
  }, [])

  const resetForm = () => {
    setMode('edit')
    setRrType('Tariff Rate'); setRrLinerId(''); setRrTradeLaneId('')
    setRrContainerType(''); setRrRate(''); setRrCurrency('USD')
    setRrValidFrom(''); setRrValidTo('')
    setRrContractId(''); setRrSalesPersonId(''); setRrServiceLane('')
    setRrOrigin(''); setRrDestination(''); setRrFreeTime('')
    setRrContainerWeight(''); setRrContractedVolume('')
    setRrNote(''); setRrSpecialRemark('')
    setRrNacRefNo(''); setRrNacCustomerName('')
    setRrApplicableCustomers([])
    setRrTariffContainers([emptyTariffContainer()])
    setRrContractedContainers([emptyContractedContainer()])
    setRrNacContainers([emptyContractedContainer()])
  }

  // Name resolution helpers for review
  const linerName = linerList.find(l => l.lin_id === rrLinerId)?.name ?? '—'
  const laneName = tradeLaneList.find(t => t.trln_id === rrTradeLaneId)?.trln_name ?? '—'
  const salesName = dbEmployeeList.find(e => e.emp_id === rrSalesPersonId)?.name ?? '—'

  // Tariff container helpers
  const updateTariffContainer = (idx: number, patch: Partial<TariffContainerRate>) =>
    setRrTariffContainers(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c))
  const addTariffContainer = () => setRrTariffContainers(prev => [...prev, emptyTariffContainer()])
  const removeTariffContainer = (idx: number) => setRrTariffContainers(prev => prev.filter((_, i) => i !== idx))

  // Contracted container helpers
  const updateContractedContainer = (idx: number, patch: Partial<ContractedContainerRate>) =>
    setRrContractedContainers(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c))
  const addContractedContainer = () => setRrContractedContainers(prev => [...prev, emptyContractedContainer()])
  const removeContractedContainer = (idx: number) => setRrContractedContainers(prev => prev.filter((_, i) => i !== idx))

  // NAC container helpers
  const updateNacContainer = (idx: number, patch: Partial<ContractedContainerRate>) =>
    setRrNacContainers(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c))
  const addNacContainer = () => setRrNacContainers(prev => [...prev, emptyContractedContainer()])
  const removeNacContainer = (idx: number) => setRrNacContainers(prev => prev.filter((_, i) => i !== idx))

  const handleSave = () => {
    const summarise = (arr: (TariffContainerRate | ContractedContainerRate)[]) =>
      arr.filter(c => c.rate !== '').map(c => `${c.containerType || '?'}: ${c.rate} ${c.currency}`).join(', ')
    const containers = rrType === 'Tariff Rate' ? rrTariffContainers : rrType === 'Contracted' ? rrContractedContainers : rrNacContainers
    onFlash(`Rate recorded: ${rrType} · ${linerName} · ${laneName} · ${summarise(containers)}`)

    // Fire API POSTs in background — one per container row that has a rate
    if (rrType === 'Tariff Rate') {
      rrTariffContainers.filter(c => c.rate !== '').forEach(ct => {
        apiCreateTariffRate({
          lin_id: rrLinerId !== '' ? rrLinerId : undefined,
          tr_ln_id: 1,
          updated_by: 1,
          salesperson: 1,
          origin: rrOrigin,
          destination: rrDestination,
          valid_from: rrValidFrom || undefined,
          valid_to: rrValidTo || undefined,
          max_weight: ct.weight.trim() ? (parseInt(ct.weight) || 0) : 0,
          container_type: ct.containerType || undefined,
          rate: ct.rate,
          currency: ct.currency,
          free_time: rrFreeTime.trim() || undefined,
          note: rrNote || undefined,
          special_remark: rrSpecialRemark || undefined,
        }).catch(err => console.error('[RecordRate] tariff POST failed:', err))
      })
    } else if (rrType === 'Contracted') {
      rrContractedContainers.filter(c => c.rate !== '').forEach(cc => {
        apiCreateContractedRate({
          lin_id: rrLinerId !== '' ? rrLinerId : undefined,
          tr_ln_id: 1,
          contract_ref_id: rrContractId || undefined,
          valid_from: rrValidFrom || undefined,
          valid_to: rrValidTo || undefined,
          contracted_volume: cc.contractedVolume.trim() ? (parseInt(cc.contractedVolume) || 0) : 0,
          container_type: cc.containerType || undefined,
          updated_by: 1,
          origin: rrOrigin,
          destination: rrDestination,
          rate: cc.rate,
          currency: cc.currency,
          emp_id_sales: 1,
          emp_id_cs: 1,
          free_time: rrFreeTime.trim() || undefined,
          max_weight: cc.weight.trim() ? parseInt(cc.weight) : undefined,
          note: rrNote || undefined,
          special_remark: rrSpecialRemark || undefined,
          client_ids: rrApplicableCustomers.length > 0
            ? rrApplicableCustomers
                .map(name => dbClientList.find(c => c.name === name)?.cli_id)
                .filter((id): id is number => id !== undefined)
            : undefined,
        }).catch(err => console.error('[RecordRate] contracted POST failed:', err))
      })
    } else {
      // NAC
      const cliId = dbClientList.find(c => c.name === rrNacCustomerName)?.cli_id
      rrNacContainers.filter(c => c.rate !== '').forEach(nc => {
        apiCreateNacRate({
          cli_id: cliId,
          lin_id: rrLinerId !== '' ? rrLinerId : undefined,
          tr_ln_id: 1,
          nac_ref_id: rrNacRefNo || undefined,
          origin: rrOrigin,
          destination: rrDestination,
          valid_from: rrValidFrom || undefined,
          valid_to: rrValidTo || undefined,
          container_type: nc.containerType || undefined,
          rate: nc.rate,
          currency: nc.currency,
          contracted_volume: nc.contractedVolume.trim() ? (parseInt(nc.contractedVolume) || 0) : 0,
          emp_id_sales: 1,
          emp_id_cs: 1,
          free_time: rrFreeTime.trim() || undefined,
          max_weight: nc.weight.trim() ? parseInt(nc.weight) : undefined,
          note: rrNote || undefined,
          special_remark: rrSpecialRemark || undefined,
        }).catch(err => console.error('[RecordRate] NAC POST failed:', err))
      })
    }

    resetForm()
  }

  const canSave = rrType === 'Tariff Rate'
    ? rrTariffContainers.some(c => c.rate !== '')
    : rrType === 'Contracted'
      ? rrContractedContainers.some(c => c.rate !== '')
      : rrNacContainers.some(c => c.rate !== '')
  const selectStyle = { width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8 } as const
  const secHead: React.CSSProperties = { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginTop: 10 }
  const secDot = (color: string): React.CSSProperties => ({ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 })

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="lt-icon-btn" onClick={mode === 'review' ? () => setMode('edit') : onGoBack} title={mode === 'review' ? 'Back to Edit' : 'Back to Workspace'} style={{ padding: 6 }}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {mode === 'review' ? <><FileText size={18} /> Review Rate</> : <><DollarSign size={18} /> Record Rate</>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {mode === 'review'
              ? 'Verify the details below. Click Back to make changes, or Confirm to save.'
              : 'Add a new rate to the database — select rate type and fill in the details.'}
          </div>
        </div>
      </div>

      {/* Form / Review */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>

        {mode === 'edit' && <>
        {/* Rate Type Selector */}
        <div style={{ marginBottom: 14 }}>
          <label className="lt-label">Rate Type <span style={{ color: '#dc2626' }}>*</span></label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {(['Tariff Rate', 'Contracted', 'NAC'] as RateSourceType[]).map(t => (
              <button
                key={t}
                className="db-btn"
                style={{
                  fontSize: 11, padding: '5px 10px', borderRadius: 6,
                  background: rrType === t ? RATE_SOURCE_COLORS[t] : 'var(--bg-card)',
                  color: rrType === t ? '#fff' : 'var(--text-secondary)',
                  border: rrType === t ? `1px solid ${RATE_SOURCE_COLORS[t]}` : '1px solid var(--border)',
                }}
                onClick={() => setRrType(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>


        {/* ---- Tariff Rate fields ---- */}
        {rrType === 'Tariff Rate' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            {/* — Carrier & Service — */}
            <div style={secHead}><span style={secDot(RATE_SOURCE_COLORS['Tariff Rate'])} />Carrier & Service</div>
            <div>
              <label className="lt-label">Liner <span style={{ color: '#dc2626' }}>*</span></label>
              <select className="lt-select" style={selectStyle} value={rrLinerId} onChange={e => setRrLinerId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">— Select liner —</option>
                {linerList.map(l => <option key={l.lin_id} value={l.lin_id}>{l.name}{l.is_on_inttra ? ' (INTTRA)' : ''}{l.has_portal ? ' (Portal)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="lt-label">Trade Lane <span style={{ color: '#dc2626' }}>*</span></label>
              <select className="lt-select" style={selectStyle} value={rrTradeLaneId} onChange={e => setRrTradeLaneId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">— Select trade lane —</option>
                {tradeLaneList.map(t => <option key={t.trln_id} value={t.trln_id}>{t.trln_name}</option>)}
              </select>
            </div>
            <div>
              <label className="lt-label">Salesperson</label>
              <select className="lt-select" style={selectStyle} value={rrSalesPersonId} onChange={e => setRrSalesPersonId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">— Select salesperson —</option>
                {dbEmployeeList.map(e => <option key={e.emp_id} value={e.emp_id}>{e.name}{e.desig ? ` (${e.desig})` : ''}</option>)}
              </select>
            </div>

            {/* — Route — */}
            <div style={secHead}><span style={secDot(RATE_SOURCE_COLORS['Tariff Rate'])} />Route</div>
            <div>
              <label className="lt-label">Origin <span style={{ color: '#dc2626' }}>*</span></label>
              <input list="rr-tr-ports-origin" className="lt-input" style={{ width: '100%' }} value={rrOrigin} onChange={e => setRrOrigin(e.target.value)} placeholder="e.g. Colombo/Sri Lanka or LKCMB" />
              <datalist id="rr-tr-ports-origin">
                {portOptions(portList).map((o, i) => <option key={i} value={o.value} label={o.label} />)}
              </datalist>
            </div>
            <div>
              <label className="lt-label">Destination <span style={{ color: '#dc2626' }}>*</span></label>
              <input list="rr-tr-ports-dest" className="lt-input" style={{ width: '100%' }} value={rrDestination} onChange={e => setRrDestination(e.target.value)} placeholder="e.g. Hamburg/Germany or DEHAM" />
              <datalist id="rr-tr-ports-dest">
                {portOptions(portList).map((o, i) => <option key={i} value={o.value} label={o.label} />)}
              </datalist>
            </div>
            <div>
              <label className="lt-label">Free Time (days)</label>
              <input className="lt-input" type="number" style={{ width: '100%' }} value={rrFreeTime} onChange={e => setRrFreeTime(e.target.value)} min={0} placeholder="e.g. 14" />
            </div>
            <div>
              <label className="lt-label">Service Lane</label>
              <input list="rr-tr-service-lanes" className="lt-input" style={{ width: '100%' }} value={rrServiceLane} onChange={e => setRrServiceLane(e.target.value)} placeholder="Type to filter..." />
              <datalist id="rr-tr-service-lanes">
                {tradeLaneList.map(t => <option key={t.trln_id} value={t.trln_name} />)}
              </datalist>
            </div>
            {/* — Validity — */}
            <div style={secHead}><span style={secDot(RATE_SOURCE_COLORS['Tariff Rate'])} />Validity</div>
            <div>
              <label className="lt-label">Valid From <span style={{ color: '#dc2626' }}>*</span></label>
              <input className="lt-input" type="date" style={{ width: '100%' }} value={rrValidFrom} onChange={e => setRrValidFrom(e.target.value)} />
            </div>
            <div>
              <label className="lt-label">Valid To <span style={{ color: '#dc2626' }}>*</span></label>
              <input className="lt-input" type="date" style={{ width: '100%' }} value={rrValidTo} onChange={e => setRrValidTo(e.target.value)} />
            </div>

            {/* — Container Rates — */}
            <div style={{ ...secHead, justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={secDot(RATE_SOURCE_COLORS['Tariff Rate'])} />Container Rates</span>
              <button type="button" className="db-btn" style={{ fontSize: 10, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 3 }} onClick={addTariffContainer}><Plus size={11} /> Add</button>
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 1fr 0.65fr 28px', gap: 8 }}>
                <label className="lt-label" style={{ margin: 0 }}>Container Type <span style={{ color: '#dc2626' }}>*</span></label>
                <label className="lt-label" style={{ margin: 0 }}>Max Weight</label>
                <label className="lt-label" style={{ margin: 0 }}>Rate <span style={{ color: '#dc2626' }}>*</span></label>
                <label className="lt-label" style={{ margin: 0 }}>Currency</label>
                <div />
              </div>
              {rrTariffContainers.map((ct, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 1fr 0.65fr 28px', gap: 8, alignItems: 'center' }}>
                  <select className="lt-select" style={{ width: '100%', fontSize: 12, padding: '8px 10px', borderRadius: 8 }} value={ct.containerType} onChange={e => updateTariffContainer(idx, { containerType: e.target.value })}>
                    <option value="">— Select —</option>
                    <option value="20GP">20GP</option><option value="40GP">40GP</option><option value="40HC">40HC</option>
                    <option value="20 Reefer">20 Reefer</option><option value="40 Reefer">40 Reefer</option>
                    <option value="20 Flat Rack">20 Flat Rack</option><option value="40 Flat Rack">40 Flat Rack</option>
                    <option value="20 Open Tops">20 Open Tops</option><option value="40 Open Tops">40 Open Tops</option>
                  </select>
                  <input className="lt-input" style={{ width: '100%' }} value={ct.weight} onChange={e => updateTariffContainer(idx, { weight: e.target.value })} placeholder="e.g. 28000 kg" />
                  <input className="lt-input" type="number" style={{ width: '100%' }} value={ct.rate} onChange={e => updateTariffContainer(idx, { rate: e.target.value === '' ? '' : Number(e.target.value) })} min={0} placeholder="e.g. 2100.00" />
                  <select className="lt-select" style={{ width: '100%', fontSize: 12, padding: '8px 6px', borderRadius: 8 }} value={ct.currency} onChange={e => updateTariffContainer(idx, { currency: e.target.value })}>
                    <option value="USD">USD</option><option value="EUR">EUR</option><option value="LKR">LKR</option><option value="GBP">GBP</option><option value="SGD">SGD</option>
                  </select>
                  <button type="button" className="lt-icon-btn" title="Remove" style={{ padding: 3, opacity: rrTariffContainers.length > 1 ? 1 : 0.3, cursor: rrTariffContainers.length > 1 ? 'pointer' : 'not-allowed' }} disabled={rrTariffContainers.length === 1} onClick={() => removeTariffContainer(idx)}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>

            {/* — Additional Information — */}
            <div style={secHead}><span style={secDot(RATE_SOURCE_COLORS['Tariff Rate'])} />Additional Information</div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="lt-label">Note</label>
              <input className="lt-input" style={{ width: '100%' }} value={rrNote} onChange={e => setRrNote(e.target.value)} placeholder="Any notes..." />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="lt-label">Analysis Note</label>
              <input className="lt-input" style={{ width: '100%' }} value={rrSpecialRemark} onChange={e => setRrSpecialRemark(e.target.value)} placeholder="Special remarks..." />
            </div>
          </div>
        )}

        {/* ---- Contracted fields ---- */}
        {rrType === 'Contracted' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            {/* — Contract & Assignment — */}
            <div style={secHead}><span style={secDot(RATE_SOURCE_COLORS['Contracted'])} />Contract & Assignment</div>
            <div>
              <label className="lt-label">Contract Reference <span style={{ color: '#dc2626' }}>*</span></label>
              <input className="lt-input" style={{ width: '100%' }} value={rrContractId} onChange={e => setRrContractId(e.target.value)} placeholder="Sent by the liner" />
            </div>
            <div>
              <label className="lt-label">Liner <span style={{ color: '#dc2626' }}>*</span></label>
              <select className="lt-select" style={selectStyle} value={rrLinerId} onChange={e => setRrLinerId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">— Select liner —</option>
                {linerList.map(l => <option key={l.lin_id} value={l.lin_id}>{l.name}{l.is_on_inttra ? ' (INTTRA)' : ''}{l.has_portal ? ' (Portal)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="lt-label">Sales Person</label>
              <select className="lt-select" style={selectStyle} value={rrSalesPersonId} onChange={e => setRrSalesPersonId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">— Select salesperson —</option>
                {dbEmployeeList.map(e => <option key={e.emp_id} value={e.emp_id}>{e.name}{e.desig ? ` (${e.desig})` : ''}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="lt-label">Applicable Customers</label>
              <TagInput
                values={rrApplicableCustomers}
                onChange={setRrApplicableCustomers}
                suggestions={dbClientList.map(c => c.name)}
                placeholder="Type to add customers..."
              />
            </div>

            {/* — Route — */}
            <div style={secHead}><span style={secDot(RATE_SOURCE_COLORS['Contracted'])} />Route</div>
            <div>
              <label className="lt-label">Origin <span style={{ color: '#dc2626' }}>*</span></label>
              <input list="rr-c-ports-origin" className="lt-input" style={{ width: '100%' }} value={rrOrigin} onChange={e => setRrOrigin(e.target.value)} placeholder="e.g. Colombo/Sri Lanka or LKCMB" />
              <datalist id="rr-c-ports-origin">
                {portOptions(portList).map((o, i) => <option key={i} value={o.value} label={o.label} />)}
              </datalist>
            </div>
            <div>
              <label className="lt-label">Destination <span style={{ color: '#dc2626' }}>*</span></label>
              <input list="rr-c-ports-dest" className="lt-input" style={{ width: '100%' }} value={rrDestination} onChange={e => setRrDestination(e.target.value)} placeholder="e.g. Hamburg/Germany or DEHAM" />
              <datalist id="rr-c-ports-dest">
                {portOptions(portList).map((o, i) => <option key={i} value={o.value} label={o.label} />)}
              </datalist>
            </div>
            <div>
              <label className="lt-label">Free Time (days)</label>
              <input className="lt-input" type="number" style={{ width: '100%' }} value={rrFreeTime} onChange={e => setRrFreeTime(e.target.value)} min={0} placeholder="e.g. 14" />
            </div>
            <div>
              <label className="lt-label">Service Lane</label>
              <input list="rr-service-lanes" className="lt-input" style={{ width: '100%' }} value={rrServiceLane} onChange={e => setRrServiceLane(e.target.value)} placeholder="Type to filter..." />
              <datalist id="rr-service-lanes">
                {tradeLaneList.map(t => <option key={t.trln_id} value={t.trln_name} />)}
              </datalist>
            </div>
            {/* — Validity — */}
            <div style={secHead}><span style={secDot(RATE_SOURCE_COLORS['Contracted'])} />Validity</div>
            <div>
              <label className="lt-label">Valid From <span style={{ color: '#dc2626' }}>*</span></label>
              <input className="lt-input" type="date" style={{ width: '100%' }} value={rrValidFrom} onChange={e => setRrValidFrom(e.target.value)} />
            </div>
            <div>
              <label className="lt-label">Valid To <span style={{ color: '#dc2626' }}>*</span></label>
              <input className="lt-input" type="date" style={{ width: '100%' }} value={rrValidTo} onChange={e => setRrValidTo(e.target.value)} />
            </div>

            {/* — Container Rates — */}
            <div style={{ ...secHead, justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={secDot(RATE_SOURCE_COLORS['Contracted'])} />Container Rates</span>
              <button type="button" className="db-btn" style={{ fontSize: 10, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 3 }} onClick={addContractedContainer}><Plus size={11} /> Add</button>
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.65fr 0.75fr 0.85fr 0.6fr 28px', gap: 8 }}>
                <label className="lt-label" style={{ margin: 0 }}>Container Type <span style={{ color: '#dc2626' }}>*</span></label>
                <label className="lt-label" style={{ margin: 0 }}>Contracted TUs</label>
                <label className="lt-label" style={{ margin: 0 }}>Max Weight</label>
                <label className="lt-label" style={{ margin: 0 }}>Rate <span style={{ color: '#dc2626' }}>*</span></label>
                <label className="lt-label" style={{ margin: 0 }}>Currency</label>
                <div />
              </div>
              {rrContractedContainers.map((cc, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.65fr 0.75fr 0.85fr 0.6fr 28px', gap: 8, alignItems: 'center' }}>
                  <select className="lt-select" style={{ width: '100%', fontSize: 12, padding: '8px 10px', borderRadius: 8 }} value={cc.containerType} onChange={e => updateContractedContainer(idx, { containerType: e.target.value })}>
                    <option value="">— Select —</option>
                    <option value="20GP">20GP</option><option value="40GP">40GP</option><option value="40HC">40HC</option>
                  </select>
                  <input className="lt-input" type="number" style={{ width: '100%' }} value={cc.contractedVolume} onChange={e => updateContractedContainer(idx, { contractedVolume: e.target.value })} min={0} placeholder="e.g. 500" />
                  <input className="lt-input" style={{ width: '100%' }} value={cc.weight} onChange={e => updateContractedContainer(idx, { weight: e.target.value })} placeholder="e.g. 28000 kg" />
                  <input className="lt-input" type="number" style={{ width: '100%' }} value={cc.rate} onChange={e => updateContractedContainer(idx, { rate: e.target.value === '' ? '' : Number(e.target.value) })} min={0} placeholder="e.g. 2450.00" />
                  <select className="lt-select" style={{ width: '100%', fontSize: 12, padding: '8px 6px', borderRadius: 8 }} value={cc.currency} onChange={e => updateContractedContainer(idx, { currency: e.target.value })}>
                    <option value="USD">USD</option><option value="EUR">EUR</option><option value="LKR">LKR</option><option value="GBP">GBP</option><option value="SGD">SGD</option>
                  </select>
                  <button type="button" className="lt-icon-btn" title="Remove" style={{ padding: 3, opacity: rrContractedContainers.length > 1 ? 1 : 0.3, cursor: rrContractedContainers.length > 1 ? 'pointer' : 'not-allowed' }} disabled={rrContractedContainers.length === 1} onClick={() => removeContractedContainer(idx)}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>

            {/* — Additional Information — */}
            <div style={secHead}><span style={secDot(RATE_SOURCE_COLORS['Contracted'])} />Additional Information</div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="lt-label">Note</label>
              <input className="lt-input" style={{ width: '100%' }} value={rrNote} onChange={e => setRrNote(e.target.value)} placeholder="Any notes..." />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="lt-label">Analysis Note</label>
              <input className="lt-input" style={{ width: '100%' }} value={rrSpecialRemark} onChange={e => setRrSpecialRemark(e.target.value)} placeholder="Special remarks..." />
            </div>
          </div>
        )}

        {/* ---- NAC fields ---- */}
        {rrType === 'NAC' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            {/* — Customer & Reference — */}
            <div style={secHead}><span style={secDot(RATE_SOURCE_COLORS['NAC'])} />Customer & Reference</div>
            <div>
              <label className="lt-label">NAC Reference No</label>
              <input className="lt-input" style={{ width: '100%' }} value={rrNacRefNo} onChange={e => setRrNacRefNo(e.target.value)} placeholder="e.g. NAC-2026-001" />
            </div>
            <div>
              <label className="lt-label">Customer Name <span style={{ color: '#dc2626' }}>*</span></label>
              <input list="rr-nac-clients" className="lt-input" style={{ width: '100%' }} value={rrNacCustomerName} onChange={e => setRrNacCustomerName(e.target.value)} placeholder="Type to filter..." />
              <datalist id="rr-nac-clients">
                {dbClientList.map(c => <option key={c.cli_id} value={c.name} />)}
              </datalist>
            </div>
            <div>
              <label className="lt-label">Sales Person <span style={{ color: '#dc2626' }}>*</span></label>
              <select className="lt-select" style={selectStyle} value={rrSalesPersonId} onChange={e => setRrSalesPersonId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">— Select salesperson —</option>
                {dbEmployeeList.map(e => <option key={e.emp_id} value={e.emp_id}>{e.name}{e.desig ? ` (${e.desig})` : ''}</option>)}
              </select>
            </div>

            {/* — Carrier & Route — */}
            <div style={secHead}><span style={secDot(RATE_SOURCE_COLORS['NAC'])} />Carrier & Route</div>
            <div>
              <label className="lt-label">Liner <span style={{ color: '#dc2626' }}>*</span></label>
              <select className="lt-select" style={selectStyle} value={rrLinerId} onChange={e => setRrLinerId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">— Select liner —</option>
                {linerList.map(l => <option key={l.lin_id} value={l.lin_id}>{l.name}{l.is_on_inttra ? ' (INTTRA)' : ''}{l.has_portal ? ' (Portal)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="lt-label">Origin <span style={{ color: '#dc2626' }}>*</span></label>
              <input list="rr-nac-ports-origin" className="lt-input" style={{ width: '100%' }} value={rrOrigin} onChange={e => setRrOrigin(e.target.value)} placeholder="e.g. Colombo/Sri Lanka or LKCMB" />
              <datalist id="rr-nac-ports-origin">
                {portOptions(portList).map((o, i) => <option key={i} value={o.value} label={o.label} />)}
              </datalist>
            </div>
            <div>
              <label className="lt-label">Destination <span style={{ color: '#dc2626' }}>*</span></label>
              <input list="rr-nac-ports-dest" className="lt-input" style={{ width: '100%' }} value={rrDestination} onChange={e => setRrDestination(e.target.value)} placeholder="e.g. Hamburg/Germany or DEHAM" />
              <datalist id="rr-nac-ports-dest">
                {portOptions(portList).map((o, i) => <option key={i} value={o.value} label={o.label} />)}
              </datalist>
            </div>
            <div>
              <label className="lt-label">Free Time (days)</label>
              <input className="lt-input" type="number" style={{ width: '100%' }} value={rrFreeTime} onChange={e => setRrFreeTime(e.target.value)} min={0} placeholder="e.g. 14" />
            </div>

            {/* — Validity — */}
            <div style={secHead}><span style={secDot(RATE_SOURCE_COLORS['NAC'])} />Validity</div>
            <div>
              <label className="lt-label">Valid From <span style={{ color: '#dc2626' }}>*</span></label>
              <input className="lt-input" type="date" style={{ width: '100%' }} value={rrValidFrom} onChange={e => setRrValidFrom(e.target.value)} />
            </div>
            <div>
              <label className="lt-label">Valid To <span style={{ color: '#dc2626' }}>*</span></label>
              <input className="lt-input" type="date" style={{ width: '100%' }} value={rrValidTo} onChange={e => setRrValidTo(e.target.value)} />
            </div>

            {/* — Container Rates — */}
            <div style={{ ...secHead, justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={secDot(RATE_SOURCE_COLORS['NAC'])} />Container Rates</span>
              <button type="button" className="db-btn" style={{ fontSize: 10, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 3 }} onClick={addNacContainer}><Plus size={11} /> Add</button>
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.65fr 0.75fr 0.85fr 0.6fr 28px', gap: 8 }}>
                <label className="lt-label" style={{ margin: 0 }}>Container Type <span style={{ color: '#dc2626' }}>*</span></label>
                <label className="lt-label" style={{ margin: 0 }}>Contracted TUs</label>
                <label className="lt-label" style={{ margin: 0 }}>Max Weight</label>
                <label className="lt-label" style={{ margin: 0 }}>Rate <span style={{ color: '#dc2626' }}>*</span></label>
                <label className="lt-label" style={{ margin: 0 }}>Currency</label>
                <div />
              </div>
              {rrNacContainers.map((nc, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.65fr 0.75fr 0.85fr 0.6fr 28px', gap: 8, alignItems: 'center' }}>
                  <select className="lt-select" style={{ width: '100%', fontSize: 12, padding: '8px 10px', borderRadius: 8 }} value={nc.containerType} onChange={e => updateNacContainer(idx, { containerType: e.target.value })}>
                    <option value="">— Select —</option>
                    <option value="20GP">20GP</option><option value="40GP">40GP</option><option value="40HC">40HC</option>
                  </select>
                  <input className="lt-input" type="number" style={{ width: '100%' }} value={nc.contractedVolume} onChange={e => updateNacContainer(idx, { contractedVolume: e.target.value })} min={0} placeholder="e.g. 500" />
                  <input className="lt-input" style={{ width: '100%' }} value={nc.weight} onChange={e => updateNacContainer(idx, { weight: e.target.value })} placeholder="e.g. 28000 kg" />
                  <input className="lt-input" type="number" style={{ width: '100%' }} value={nc.rate} onChange={e => updateNacContainer(idx, { rate: e.target.value === '' ? '' : Number(e.target.value) })} min={0} placeholder="e.g. 3200.00" />
                  <select className="lt-select" style={{ width: '100%', fontSize: 12, padding: '8px 6px', borderRadius: 8 }} value={nc.currency} onChange={e => updateNacContainer(idx, { currency: e.target.value })}>
                    <option value="USD">USD</option><option value="EUR">EUR</option><option value="LKR">LKR</option><option value="GBP">GBP</option><option value="SGD">SGD</option>
                  </select>
                  <button type="button" className="lt-icon-btn" title="Remove" style={{ padding: 3, opacity: rrNacContainers.length > 1 ? 1 : 0.3, cursor: rrNacContainers.length > 1 ? 'pointer' : 'not-allowed' }} disabled={rrNacContainers.length === 1} onClick={() => removeNacContainer(idx)}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>

            {/* — Additional Information — */}
            <div style={secHead}><span style={secDot(RATE_SOURCE_COLORS['NAC'])} />Additional Information</div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="lt-label">Note</label>
              <input className="lt-input" style={{ width: '100%' }} value={rrNote} onChange={e => setRrNote(e.target.value)} placeholder="Any notes..." />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="lt-label">Analysis Note</label>
              <input className="lt-input" style={{ width: '100%' }} value={rrSpecialRemark} onChange={e => setRrSpecialRemark(e.target.value)} placeholder="Special remarks..." />
            </div>
          </div>
        )}


        {/* Edit Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 16 }}>
          <button className="db-btn" style={{ fontSize: 12 }} onClick={onGoBack}>Back to Workspace</button>
          <button
            className="db-btn primary"
            style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
              opacity: canSave ? 1 : 0.5,
              cursor: canSave ? 'pointer' : 'not-allowed',
            }}
            disabled={!canSave}
            onClick={() => setMode('review')}
          >
            <FileText size={12} /> Review & Save
          </button>
        </div>
        </>}

        {/* ======== REVIEW MODE ======== */}
        {mode === 'review' && (() => {
          const accent = RATE_SOURCE_COLORS[rrType]
          const row = (label: string, value: string) => (
            <div className="ws-doc-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
              <strong style={{ fontSize: 12, color: 'var(--text)' }}>{value || '—'}</strong>
            </div>
          )
          const containerRows = (arr: (TariffContainerRate | ContractedContainerRate)[]) =>
            arr.filter(c => c.rate !== '').map((c, i) => (
              <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'var(--bg)', marginTop: i > 0 ? 6 : 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Container {i + 1}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Type</span><strong>{c.containerType || '—'}</strong>
                  {'contractedVolume' in c && c.contractedVolume && <><span style={{ color: 'var(--text-muted)' }}>Contracted TUs</span><strong>{c.contractedVolume}</strong></>}
                  {c.weight && <><span style={{ color: 'var(--text-muted)' }}>Max Weight</span><strong>{c.weight}</strong></>}
                  <span style={{ color: 'var(--text-muted)' }}>Rate</span><strong>{c.rate} {c.currency}</strong>
                </div>
              </div>
            ))

          return <>
            {/* Rate type badge */}
            <div style={{ marginBottom: 16 }}>
              <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700, color: '#fff', background: accent }}>{rrType}</span>
            </div>

            {/* Common fields */}
            <div style={{ marginBottom: 16 }}>
              {rrType === 'Tariff Rate' && <>
                <div style={secHead}><span style={secDot(accent)} />Carrier & Service</div>
                {row('Liner', linerName)}
                {row('Trade Lane', laneName)}
                {row('Salesperson', salesName)}
                {row('Service Lane', rrServiceLane)}
              </>}

              {rrType === 'Contracted' && <>
                <div style={secHead}><span style={secDot(accent)} />Contract & Assignment</div>
                {row('Contract Reference', rrContractId)}
                {row('Liner', linerName)}
                {row('Sales Person', salesName)}
                {row('Service Lane', rrServiceLane)}
                {rrApplicableCustomers.length > 0 && row('Applicable Customers', rrApplicableCustomers.join(', '))}
              </>}

              {rrType === 'NAC' && <>
                <div style={secHead}><span style={secDot(accent)} />Customer & Reference</div>
                {row('NAC Reference No', rrNacRefNo)}
                {row('Customer Name', rrNacCustomerName)}
                {row('Sales Person', salesName)}
                <div style={{ ...secHead, marginTop: 16 }}><span style={secDot(accent)} />Carrier</div>
                {row('Liner', linerName)}
              </>}
            </div>

            {/* Route */}
            <div style={{ marginBottom: 16 }}>
              <div style={secHead}><span style={secDot(accent)} />Route</div>
              {row('Origin', rrOrigin)}
              {row('Destination', rrDestination)}
              {row('Free Time', rrFreeTime ? `${rrFreeTime} days` : '—')}
            </div>

            {/* Validity */}
            <div style={{ marginBottom: 16 }}>
              <div style={secHead}><span style={secDot(accent)} />Validity</div>
              {row('Valid From', rrValidFrom)}
              {row('Valid To', rrValidTo)}
            </div>

            {/* Container Rates */}
            <div style={{ marginBottom: 16 }}>
              <div style={secHead}><span style={secDot(accent)} />Container Rates</div>
              {rrType === 'Tariff Rate' && containerRows(rrTariffContainers)}
              {rrType === 'Contracted' && containerRows(rrContractedContainers)}
              {rrType === 'NAC' && containerRows(rrNacContainers)}
            </div>

            {/* Additional Info */}
            {(rrNote || rrSpecialRemark) && <div style={{ marginBottom: 8 }}>
              <div style={secHead}><span style={secDot(accent)} />Additional Information</div>
              {rrNote && row('Note', rrNote)}
              {rrSpecialRemark && row('Analysis Note', rrSpecialRemark)}
            </div>}

            {/* Review Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 16 }}>
              <button className="db-btn" style={{ fontSize: 12 }} onClick={() => setMode('edit')}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><ArrowLeft size={12} /> Back to Edit</span>
              </button>
              <button
                className="db-btn primary"
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
                onClick={handleSave}
              >
                <Check size={12} /> Confirm & Save
              </button>
            </div>
          </>
        })()}
      </div>
    </div>
  )
}
