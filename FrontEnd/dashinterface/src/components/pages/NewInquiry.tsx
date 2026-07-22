import { useState, useEffect } from 'react'
import { ArrowLeft, Plus, Save, X } from 'lucide-react'
import {
  SBUS, INQUIRY_PRIORITIES, COMMODITY_TYPES, CONTAINER_TYPES,
  emptyContainerLine,
  type Inquiry, type LinerRecord, type ContainerLine,
  type ClientRecord, type ContactPersonRecord,
  type SBU, type DeliveryType,
  type InquiryPriority, type CommodityType, type ContainerType,
} from '../../types'
import { apiGetLiners } from '../../api'
import TagInput from '../shared/TagInput'
import PortCombobox from '../shared/PortCombobox'
import SearchCombobox from '../shared/SearchCombobox'

interface NewInquiryProps {
  clientList: ClientRecord[]
  contactPersonList: ContactPersonRecord[]
  activeEmployee: { id: number; name: string }
  onCreateInquiry: (data: Omit<Inquiry, 'id' | 'created_at' | 'status' | 'completed_at' | 'followup_note' | 'inquiry_text'>) => Inquiry
  onFlash: (msg: string, action?: { label: string; onClick: () => void }) => void
  onGoBack: () => void
}

export default function NewInquiry({ clientList, contactPersonList, activeEmployee, onCreateInquiry, onFlash, onGoBack }: NewInquiryProps) {
  // Inquiry-level state
  const [niCustomer, setNiCustomer] = useState('')
  const [niOrigin, setNiOrigin] = useState('')
  const [niChannel, setNiChannel] = useState<'WhatsApp' | 'Email' | 'Phone' | 'WeChat'>('Email')
  const [niSbu, setNiSbu] = useState<SBU>('Ocean Imports')
  const [niDelivery, setNiDelivery] = useState<DeliveryType>('port-to-port')
  const [niPriority, setNiPriority] = useState<InquiryPriority>('Medium')
  const [niIncoterm, setNiIncoterm] = useState('')
  const [niCargoReadyDate, setNiCargoReadyDate] = useState('')
  const [niPreferredRate, setNiPreferredRate] = useState<number | ''>('')
  const [niPreferredLiners, setNiPreferredLiners] = useState<string[]>([])
  const [niRemark, setNiRemark] = useState('')
  const [niContactPerson, setNiContactPerson] = useState('')
  const [niContactDesignation, setNiContactDesignation] = useState('')
  const [niContactChannelId, setNiContactChannelId] = useState('')

  // Multi-container state
  const [containers, setContainers] = useState<ContainerLine[]>([emptyContainerLine()])

  // Reference data — liners fetched locally; clients/contacts come from app-level cache via props
  const [linerList, setLinerList] = useState<LinerRecord[]>([])

  useEffect(() => {
    apiGetLiners().then(setLinerList).catch(() => {})
  }, [])

  const updateContainer = (idx: number, patch: Partial<ContainerLine>) => {
    setContainers(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c))
  }

  const addContainer = () => {
    const first = containers[0]
    setContainers(prev => [...prev, {
      ...emptyContainerLine(),
      commodityType: first?.commodityType ?? 'Miscellaneous manufactured articles — furniture, toys',
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
    setNiPriority('Medium'); setNiIncoterm(''); setNiCargoReadyDate(''); setNiPreferredRate('')
    setNiPreferredLiners([])
    setNiRemark('')
    setNiContactPerson(''); setNiContactDesignation(''); setNiContactChannelId('')
    setContainers([emptyContainerLine()])
  }

  // Silently detect which backend case to use based on whether names match existing DB records.
  // Case 1: new customer name → new client + new contact
  // Case 2: name matches existing client, contact name not found → existing client + new contact
  // Case 3: both names match → existing client + existing contact
  const matchedCli = clientList.find(
    cl => cl.name.trim().toLowerCase() === niCustomer.trim().toLowerCase()
  ) ?? null
  const matchedCp = matchedCli
    ? (contactPersonList.find(
        cp => cp.cli_id === matchedCli.cli_id &&
              (cp.name ?? '').trim().toLowerCase() === niContactPerson.trim().toLowerCase()
      ) ?? null)
    : null

  const handleSave = () => {
    const customerName = niCustomer.trim()
    if (!customerName) return
    const firstContainer = containers[0]
    const autoRequest = [
      firstContainer ? `${firstContainer.quantity}x ${firstContainer.containerType}` : '',
      niOrigin.trim() || '',
      firstContainer?.destination.trim() ? `to ${firstContainer.destination.trim()}` : '',
      firstContainer?.commodityName.trim() ? `— ${firstContainer.commodityName.trim()}` : '',
    ].filter(Boolean).join(' ') || `Inquiry from ${customerName}`

    const created = onCreateInquiry({
      customer_name: customerName,
      // Passing cli_id / cpid tells App.tsx which endpoint to route to (cases 2 and 3)
      ...(matchedCli ? { cli_id: matchedCli.cli_id } : {}),
      ...(matchedCp  ? { cpid:   matchedCp.cp_id   } : {}),
      request: autoRequest,
      origin: niOrigin.trim() || 'TBD',
      destination: firstContainer?.destination.trim() || 'TBD',
      delivery_type: niDelivery,
      sbu: niSbu,
      employee_id: 1,
      workflow_stage: 'inquiry-received',
      priority: niPriority,
      incoterm: niIncoterm.trim() || undefined,
      cargo_ready_date: niCargoReadyDate || undefined,
      preferred_rate: niPreferredRate !== '' ? niPreferredRate : undefined,
      commodity_type: firstContainer?.commodityType,
      container_type: firstContainer?.containerType,
      container_qty: firstContainer?.quantity,
      cargo_weight: firstContainer?.weight === '' ? undefined : firstContainer?.weight,
      is_fcl: firstContainer?.isFcl ?? true,
      remark: niRemark.trim() || undefined,
      // Contact fields omitted for case 3 (existing contact — backend already has them)
      channel:             matchedCp ? undefined : niChannel,
      contact_person:      matchedCp ? undefined : (niContactPerson.trim() || undefined),
      contact_designation: matchedCp ? undefined : (niContactDesignation.trim() || undefined),
      contact_channel_id:  matchedCp ? undefined : (niContactChannelId.trim() || undefined),
      containers,
      preferred_liners: niPreferredLiners.length > 0 ? niPreferredLiners : undefined,
    })
    onFlash(`Inquiry created for ${created.customer_name}`)
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
          {/* Customer name — searchable dropdown from DB client list. Silently routes to case 2/3 on match. */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="lt-label">
              Customer <span style={{ color: '#dc2626' }}>*</span>
              {matchedCli && <span style={{ marginLeft: 8, fontSize: 11, color: '#16a34a', fontWeight: 500 }}>✓ existing client</span>}
            </label>
            <SearchCombobox
              value={niCustomer}
              onChange={val => { setNiCustomer(val); setNiContactPerson('') }}
              items={clientList.map(cl => ({ label: cl.name, sublabel: cl.city ?? undefined }))}
              placeholder="Type or select customer name"
              autoFocus
            />
          </div>

          {/* Contact person — filtered to the matched client's contacts */}
          <div>
            <label className="lt-label">
              Contact Person
              {matchedCp && <span style={{ marginLeft: 8, fontSize: 11, color: '#16a34a', fontWeight: 500 }}>✓ existing contact</span>}
            </label>
            <SearchCombobox
              value={niContactPerson}
              onChange={setNiContactPerson}
              items={(matchedCli
                ? contactPersonList.filter(cp => cp.cli_id === matchedCli.cli_id)
                : contactPersonList
              ).map(cp => ({ label: cp.name ?? '', sublabel: cp.email ?? undefined }))}
              placeholder="Name of the person making the inquiry"
            />
          </div>

          {/* Designation / channel — hidden when contact already exists in DB (case 3) */}
          {!matchedCp && (<>
          <div>
            <label className="lt-label">Designation</label>
            <input className="lt-input" style={{ width: '100%' }} value={niContactDesignation} onChange={e => setNiContactDesignation(e.target.value)} placeholder="e.g. Logistics Manager" />
          </div>
          <div>
            <label className="lt-label">Channel <span style={{ color: '#dc2626' }}>*</span></label>
            <select className="lt-select" style={selectStyle} value={niChannel} onChange={e => { setNiChannel(e.target.value as 'WhatsApp' | 'Email' | 'Phone' | 'WeChat'); setNiContactChannelId('') }}>
              <option>Email</option><option>WhatsApp</option><option>Phone</option><option>WeChat</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="lt-label">{niChannel === 'Email' ? 'Email Address' : niChannel === 'WhatsApp' ? 'WhatsApp Number' : niChannel === 'Phone' ? 'Phone Number' : 'WeChat ID'}</label>
            <input
              className="lt-input" style={{ width: '100%' }}
              type={niChannel === 'Email' ? 'email' : niChannel === 'WeChat' ? 'text' : 'tel'}
              value={niContactChannelId}
              onChange={e => setNiContactChannelId(e.target.value)}
              placeholder={niChannel === 'Email' ? 'e.g. john@acme.com' : niChannel === 'WhatsApp' ? 'e.g. +94 77 123 4567' : niChannel === 'Phone' ? 'e.g. +94 11 234 5678' : 'e.g. john_doe'}
            />
          </div>
          </>)}
          <div>
            <label className="lt-label">Origin <span style={{ color: '#dc2626' }}>*</span></label>
            <PortCombobox
              value={niOrigin}
              onChange={setNiOrigin}
              placeholder="e.g. Colombo/Sri Lanka"
            />
          </div>
          <div>
            <label className="lt-label">Priority <span style={{ color: '#dc2626' }}>*</span></label>
            <select className="lt-select" style={selectStyle} value={niPriority} onChange={e => setNiPriority(e.target.value as InquiryPriority)}>
              {INQUIRY_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
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
            <label className="lt-label">Incoterm</label>
            <input className="lt-input" style={{ width: '100%' }} value={niIncoterm} onChange={e => setNiIncoterm(e.target.value)} placeholder="e.g. FOB, CIF, EXW, DDP" />
          </div>
          <div>
            <label className="lt-label">Cargo Ready Date</label>
            <input className="lt-input" type="date" style={{ width: '100%' }} value={niCargoReadyDate} onChange={e => setNiCargoReadyDate(e.target.value)} />
          </div>
          <div>
            <label className="lt-label">Preferred Rate (USD)</label>
            <input className="lt-input" type="number" style={{ width: '100%' }} value={niPreferredRate} onChange={e => setNiPreferredRate(e.target.value === '' ? '' : Number(e.target.value))} min={0} placeholder="e.g. 1200" />
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
                  <PortCombobox
                    value={c.destination}
                    onChange={dest => updateContainer(idx, { destination: dest })}
                    placeholder="e.g. Hamburg/Germany"
                  />
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
                <div>
                  <label className="lt-label">Temperature (°C)</label>
                  <input className="lt-input" type="number" style={{ width: '100%' }} value={c.temperature ?? ''} onChange={e => updateContainer(idx, { temperature: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="e.g. -18 (reefer only)" />
                </div>
                <div>
                  <label className="lt-label">HS Code</label>
                  <input className="lt-input" style={{ width: '100%' }} value={c.hs_code ?? ''} onChange={e => updateContainer(idx, { hs_code: e.target.value || undefined })} placeholder="e.g. 6109.10" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="lt-label">Commodity Description</label>
                  <input className="lt-input" style={{ width: '100%' }} value={c.description ?? ''} onChange={e => updateContainer(idx, { description: e.target.value || undefined })} placeholder="Brief description of the goods" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="lt-label">Delivery Address</label>
                  <input className="lt-input" style={{ width: '100%' }} value={c.address ?? ''} onChange={e => updateContainer(idx, { address: e.target.value || undefined })} placeholder="Door delivery address (door-to-door only)" />
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
