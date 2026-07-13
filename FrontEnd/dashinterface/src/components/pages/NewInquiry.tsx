import { useState, useEffect } from 'react'
import { ArrowLeft, Plus, Save, X } from 'lucide-react'
import {
  SBUS, INQUIRY_PRIORITIES, COMMODITY_TYPES, CONTAINER_TYPES, SPECIAL_EQUIPMENT_OPTIONS,
  emptyContainerLine, portOptions,
  type Inquiry, type Customer, type PortRecord, type LinerRecord, type ContainerLine,
  type SBU, type DeliveryType,
  type InquiryPriority, type CommodityType, type ContainerType, type SpecialEquipment,
} from '../../mockData'
import { apiGetPorts, apiGetLiners } from '../../api'
import TagInput from '../shared/TagInput'

interface NewInquiryProps {
  customers: Customer[]
  activeEmployee: { id: number; name: string }
  onCreateInquiry: (data: Omit<Inquiry, 'id' | 'created_at' | 'status' | 'completed_at' | 'followup_note' | 'inquiry_text'>) => Inquiry
  onFlash: (msg: string, action?: { label: string; onClick: () => void }) => void
  onGoBack: () => void
}

export default function NewInquiry({ customers, activeEmployee, onCreateInquiry, onFlash, onGoBack }: NewInquiryProps) {
  // Inquiry-level state
  const [niCustomer, setNiCustomer] = useState('')
  const [niOrigin, setNiOrigin] = useState('')
  const [niChannel, setNiChannel] = useState<'WhatsApp' | 'Email' | 'Phone'>('Email')
  const [niSbu, setNiSbu] = useState<SBU>('Ocean Imports')
  const [niDelivery, setNiDelivery] = useState<DeliveryType>('port-to-port')
  const [niPriority, setNiPriority] = useState<InquiryPriority>('Medium')
  const [niPreferredLiners, setNiPreferredLiners] = useState<string[]>([])
  const [niSpecialEquip, setNiSpecialEquip] = useState<SpecialEquipment>('None')
  const [niRemark, setNiRemark] = useState('')
  const [niContactPerson, setNiContactPerson] = useState('')
  const [niContactChannelId, setNiContactChannelId] = useState('')

  // Multi-container state
  const [containers, setContainers] = useState<ContainerLine[]>([emptyContainerLine()])

  // Reference data
  const [portList, setPortList] = useState<PortRecord[]>([])
  const [linerList, setLinerList] = useState<LinerRecord[]>([])

  useEffect(() => {
    apiGetPorts().then(setPortList).catch(() => {})
    apiGetLiners().then(setLinerList).catch(() => {})
  }, [])

  const updateContainer = (idx: number, patch: Partial<ContainerLine>) => {
    setContainers(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c))
  }

  const addContainer = () => {
    const first = containers[0]
    setContainers(prev => [...prev, {
      ...emptyContainerLine(),
      commodityType: first?.commodityType ?? 'General',
      commodityName: first?.commodityName ?? '',
      destination: first?.destination ?? '',
    }])
  }

  const removeContainer = (idx: number) => {
    if (containers.length <= 1) return
    setContainers(prev => prev.filter((_, i) => i !== idx))
  }

  const resetForm = () => {
    setNiCustomer(''); setNiOrigin('')
    setNiChannel('Email'); setNiSbu('Ocean Imports'); setNiDelivery('port-to-port')
    setNiPriority('Medium'); setNiPreferredLiners([])
    setNiSpecialEquip('None'); setNiRemark('')
    setNiContactPerson(''); setNiContactChannelId('')
    setContainers([emptyContainerLine()])
  }

  const handleSave = () => {
    if (!niCustomer.trim()) return
    const firstContainer = containers[0]
    // Auto-generate request summary from structured fields
    const autoRequest = [
      firstContainer ? `${firstContainer.quantity}x ${firstContainer.containerType}` : '',
      niOrigin.trim() || '',
      firstContainer?.destination.trim() ? `to ${firstContainer.destination.trim()}` : '',
      firstContainer?.commodityName.trim() ? `— ${firstContainer.commodityName.trim()}` : '',
    ].filter(Boolean).join(' ') || `Inquiry from ${niCustomer.trim()}`
    const created = onCreateInquiry({
      customer_name: niCustomer.trim(),
      request: autoRequest,
      origin: niOrigin.trim() || 'TBD',
      destination: firstContainer?.destination.trim() || 'TBD',
      delivery_type: niDelivery,
      channel: niChannel,
      sbu: niSbu,
      employee_id: activeEmployee.id,
      workflow_stage: 'inquiry-received',
      priority: niPriority,
      commodity_type: firstContainer?.commodityType,
      container_type: firstContainer?.containerType,
      container_qty: firstContainer?.quantity,
      special_equipment: niSpecialEquip,
      cargo_weight: firstContainer?.weight === '' ? undefined : firstContainer?.weight,
      is_fcl: firstContainer?.isFcl ?? true,
      remark: niRemark.trim() || undefined,
      contact_person: niContactPerson.trim() || undefined,
      contact_channel_id: niContactChannelId.trim() || undefined,
      containers,
      preferred_liners: niPreferredLiners.length > 0 ? niPreferredLiners : undefined,
    })
    onFlash(`Inquiry ${created.id} created for ${created.customer_name}`)
    resetForm()
  }

  const canSave = !!niCustomer.trim()

  const selectStyle = { width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8 } as const

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button className="lt-icon-btn" onClick={onGoBack} title="Back to Workspace" style={{ padding: 6 }}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={18} /> New Inquiry
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Log a new shipping inquiry — it will enter the workflow at Step 1. Save to submit and add another.
          </div>
        </div>
      </div>

      {/* Form */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
        {/* Inquiry-level fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="lt-label">Customer Name <span style={{ color: '#dc2626' }}>*</span></label>
            <input list="ni-customers" className="lt-input" style={{ width: '100%' }} value={niCustomer} onChange={e => setNiCustomer(e.target.value)} placeholder="Select or type customer name" autoFocus />
            <datalist id="ni-customers">
              {customers.map(c => <option key={c.id} value={c.name} />)}
            </datalist>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="lt-label">Contact Person</label>
            <input className="lt-input" style={{ width: '100%' }} value={niContactPerson} onChange={e => setNiContactPerson(e.target.value)} placeholder="Name of the person making the inquiry" />
          </div>
          <div>
            <label className="lt-label">Origin <span style={{ color: '#dc2626' }}>*</span></label>
            <input list="ni-ports-origin" className="lt-input" style={{ width: '100%' }} value={niOrigin} onChange={e => setNiOrigin(e.target.value)} placeholder="e.g. Colombo/Sri Lanka or LKCMB" />
            <datalist id="ni-ports-origin">
              {portOptions(portList).map((o, i) => <option key={i} value={o.value} label={o.label} />)}
            </datalist>
          </div>
          <div>
            <label className="lt-label">Priority <span style={{ color: '#dc2626' }}>*</span></label>
            <select className="lt-select" style={selectStyle} value={niPriority} onChange={e => setNiPriority(e.target.value as InquiryPriority)}>
              {INQUIRY_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="lt-label">Channel <span style={{ color: '#dc2626' }}>*</span></label>
            <select className="lt-select" style={selectStyle} value={niChannel} onChange={e => { setNiChannel(e.target.value as 'WhatsApp' | 'Email' | 'Phone'); setNiContactChannelId('') }}>
              <option>Email</option><option>WhatsApp</option><option>Phone</option>
            </select>
          </div>
          <div>
            <label className="lt-label">{niChannel === 'Email' ? 'Email Address' : niChannel === 'WhatsApp' ? 'WhatsApp Number' : 'Phone Number'}</label>
            <input
              className="lt-input" style={{ width: '100%' }}
              type={niChannel === 'Email' ? 'email' : 'tel'}
              value={niContactChannelId}
              onChange={e => setNiContactChannelId(e.target.value)}
              placeholder={niChannel === 'Email' ? 'e.g. john@acme.com' : niChannel === 'WhatsApp' ? 'e.g. +94 77 123 4567' : 'e.g. +94 11 234 5678'}
            />
          </div>
          <div>
            <label className="lt-label">SBU <span style={{ color: '#dc2626' }}>*</span></label>
            <select className="lt-select" style={selectStyle} value={niSbu} onChange={e => setNiSbu(e.target.value as SBU)}>
              {SBUS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="lt-label">Delivery Type <span style={{ color: '#dc2626' }}>*</span></label>
            <select className="lt-select" style={selectStyle} value={niDelivery} onChange={e => setNiDelivery(e.target.value as DeliveryType)}>
              <option value="port-to-port">Port to Port</option>
              <option value="door-to-door">Door to Door</option>
            </select>
          </div>
          <div>
            <label className="lt-label">Special Equipment</label>
            <select className="lt-select" style={selectStyle} value={niSpecialEquip} onChange={e => setNiSpecialEquip(e.target.value as SpecialEquipment)}>
              {SPECIAL_EQUIPMENT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="lt-label">Preferred Liners</label>
            <TagInput
              values={niPreferredLiners}
              onChange={setNiPreferredLiners}
              suggestions={linerList.map(l => l.name)}
              placeholder="Type to add liners..."
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="lt-label">Remarks</label>
            <input className="lt-input" style={{ width: '100%' }} value={niRemark} onChange={e => setNiRemark(e.target.value)} placeholder="Any special instructions or notes" />
          </div>
        </div>

        {/* Containers section */}
        <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Containers</div>

          {containers.map((c, idx) => (
            <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 10, background: 'var(--bg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Container {idx + 1}</span>
                {containers.length > 1 && (
                  <button className="lt-icon-btn" onClick={() => removeContainer(idx)} title="Remove container" style={{ padding: 4 }}>
                    <X size={14} />
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label className="lt-label">Commodity Type <span style={{ color: '#dc2626' }}>*</span></label>
                  <select className="lt-select" style={selectStyle} value={c.commodityType} onChange={e => updateContainer(idx, { commodityType: e.target.value as CommodityType })}>
                    {COMMODITY_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lt-label">Commodity Name</label>
                  <input className="lt-input" style={{ width: '100%' }} value={c.commodityName} onChange={e => updateContainer(idx, { commodityName: e.target.value })} placeholder="e.g. Cotton T-shirts" />
                </div>
                <div>
                  <label className="lt-label">Destination <span style={{ color: '#dc2626' }}>*</span></label>
                  <input list={`ni-ports-dest-${idx}`} className="lt-input" style={{ width: '100%' }} value={c.destination} onChange={e => updateContainer(idx, { destination: e.target.value })} placeholder="e.g. Hamburg/Germany or DEHAM" />
                  <datalist id={`ni-ports-dest-${idx}`}>
                    {portOptions(portList).map((o, i) => <option key={i} value={o.value} label={o.label} />)}
                  </datalist>
                </div>
                <div>
                  <label className="lt-label">Container Type <span style={{ color: '#dc2626' }}>*</span></label>
                  <select className="lt-select" style={selectStyle} value={c.containerType} onChange={e => updateContainer(idx, { containerType: e.target.value as ContainerType })}>
                    {CONTAINER_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lt-label">Qty <span style={{ color: '#dc2626' }}>*</span></label>
                  <input className="lt-input" type="number" style={{ width: '100%' }} value={c.quantity} onChange={e => updateContainer(idx, { quantity: Math.max(1, Number(e.target.value)) })} min={1} />
                </div>
                <div>
                  <label className="lt-label">Weight (kg)</label>
                  <input className="lt-input" type="number" style={{ width: '100%' }} value={c.weight} onChange={e => updateContainer(idx, { weight: e.target.value === '' ? '' : Number(e.target.value) })} min={0} placeholder="e.g. 18000" />
                </div>
                <div>
                  <label className="lt-label">FCL / LCL <span style={{ color: '#dc2626' }}>*</span></label>
                  <select className="lt-select" style={selectStyle} value={c.isFcl ? 'FCL' : 'LCL'} onChange={e => updateContainer(idx, { isFcl: e.target.value === 'FCL' })}>
                    <option value="FCL">FCL</option>
                    <option value="LCL">LCL</option>
                  </select>
                </div>
                <div>
                  <label className="lt-label">Zip Code</label>
                  <input className="lt-input" style={{ width: '100%' }} value={c.zipCode} onChange={e => updateContainer(idx, { zipCode: e.target.value })} placeholder="e.g. 20095" />
                </div>
                <div>
                  <label className="lt-label">Free Time (days)</label>
                  <input className="lt-input" type="number" style={{ width: '100%' }} value={c.freeTime} onChange={e => updateContainer(idx, { freeTime: e.target.value === '' ? '' : Number(e.target.value) })} min={0} placeholder="e.g. 14" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="lt-label">Door Agent</label>
                  <TagInput
                    values={c.doorAgents}
                    onChange={doorAgents => updateContainer(idx, { doorAgents })}
                    suggestions={linerList.map(l => l.name)}
                    placeholder="Type to add door agents..."
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            className="db-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, marginTop: 4 }}
            onClick={addContainer}
          >
            <Plus size={12} /> Add Container
          </button>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 16 }}>
          <button className="db-btn" style={{ fontSize: 12 }} onClick={onGoBack}>Back to Workspace</button>
          <button
            className="db-btn primary"
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, opacity: canSave ? 1 : 0.5, cursor: canSave ? 'pointer' : 'not-allowed' }}
            disabled={!canSave}
            onClick={handleSave}
          >
            <Save size={12} /> Save Inquiry
          </button>
        </div>
      </div>
    </div>
  )
}
