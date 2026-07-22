import { useState, useEffect } from 'react'
import { X, Check } from 'lucide-react'
import { EMPLOYEES, CUSTOMER_TYPES, type Customer, type CustomerTier, type PaymentTerms, type CustomerType } from '../../types'

interface CustomerEditModalProps {
  customer: Customer
  onSave: (customerName: string, patch: Partial<Omit<Customer, 'id'>>) => void
  onClose: () => void
}

export default function CustomerEditModal({ customer, onSave, onClose }: CustomerEditModalProps) {
  const [tier, setTier] = useState<CustomerTier>(customer.tier)
  const [payment, setPayment] = useState<PaymentTerms>(customer.payment_terms)
  const [location, setLocation] = useState(customer.location)
  const [email, setEmail] = useState(customer.contact_email ?? '')
  const [phone, setPhone] = useState(customer.contact_phone ?? '')
  const [contactPerson, setContactPerson] = useState(customer.contact_person ?? '')
  const [customerType, setCustomerType] = useState<CustomerType | ''>(customer.customer_type ?? '')
  const [assignedSalesperson, setAssignedSalesperson] = useState<number | ''>(customer.assigned_salesperson_id ?? '')
  const [notes, setNotes] = useState(customer.notes ?? '')
  const [margin, setMargin] = useState(customer.min_margin_pct)
  const [blacklisted, setBlacklisted] = useState(customer.blacklisted)
  const [creditHold, setCreditHold] = useState(customer.credit_hold)

  // Reset form when customer changes
  useEffect(() => {
    setTier(customer.tier)
    setPayment(customer.payment_terms)
    setLocation(customer.location)
    setEmail(customer.contact_email ?? '')
    setPhone(customer.contact_phone ?? '')
    setContactPerson(customer.contact_person ?? '')
    setCustomerType(customer.customer_type ?? '')
    setAssignedSalesperson(customer.assigned_salesperson_id ?? '')
    setNotes(customer.notes ?? '')
    setMargin(customer.min_margin_pct)
    setBlacklisted(customer.blacklisted)
    setCreditHold(customer.credit_hold)
  }, [customer])

  const salesEmployees = EMPLOYEES.filter(e => e.role === 'Sales Executive')

  return (
    <div className="lt-modal-backdrop" onClick={onClose}>
      <div className="lt-modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: 4 }}>{customer.id}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Edit Customer</div>
          </div>
          <button className="lt-modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          {customer.name}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Tier
            <select className="lt-input" style={{ width: '100%', marginTop: 4 }} value={tier} onChange={e => setTier(e.target.value as CustomerTier)}>
              <option value="Key Account">Key Account</option>
              <option value="Regular">Regular</option>
              <option value="Walk-in">Walk-in</option>
            </select>
          </label>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Payment Terms
            <select className="lt-input" style={{ width: '100%', marginTop: 4 }} value={payment} onChange={e => setPayment(e.target.value as PaymentTerms)}>
              <option value="Pay Upfront">Pay Upfront</option>
              <option value="30-Day Credit">30-Day Credit</option>
              <option value="60-Day Credit">60-Day Credit</option>
            </select>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Customer Type
            <select className="lt-input" style={{ width: '100%', marginTop: 4 }} value={customerType} onChange={e => setCustomerType(e.target.value as CustomerType | '')}>
              <option value="">Not set</option>
              {CUSTOMER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Assigned Salesperson
            <select className="lt-input" style={{ width: '100%', marginTop: 4 }} value={assignedSalesperson} onChange={e => setAssignedSalesperson(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Not assigned</option>
              {salesEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
        </div>

        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Location
          <input className="lt-input" style={{ width: '100%', marginTop: 4 }} value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Colombo, Sri Lanka" />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Contact Person
            <input className="lt-input" style={{ width: '100%', marginTop: 4 }} value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="Primary contact name" />
          </label>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Contact Email
            <input className="lt-input" style={{ width: '100%', marginTop: 4 }} value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" />
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Contact Phone
            <input className="lt-input" style={{ width: '100%', marginTop: 4 }} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+94..." />
          </label>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Min Margin %
            <input className="lt-input" type="number" style={{ width: '100%', marginTop: 4 }} value={margin} onChange={e => setMargin(Number(e.target.value))} min={0} max={100} step={0.5} />
          </label>
        </div>

        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Notes
          <textarea className="lt-input" style={{ width: '100%', marginTop: 4, minHeight: 60, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes..." />
        </label>

        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: blacklisted ? '#dc2626' : 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={blacklisted} onChange={e => setBlacklisted(e.target.checked)} />
            Blacklisted
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: creditHold ? '#d97706' : 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={creditHold} onChange={e => setCreditHold(e.target.checked)} />
            Credit Hold
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <button className="db-btn" style={{ fontSize: 12 }} onClick={onClose}>Cancel</button>
          <button
            className="db-btn primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
            onClick={() => {
              onSave(customer.name, {
                tier,
                payment_terms: payment,
                location,
                min_margin_pct: margin,
                blacklisted,
                credit_hold: creditHold,
                notes: notes || undefined,
                contact_email: email || undefined,
                contact_phone: phone || undefined,
                contact_person: contactPerson || undefined,
                customer_type: customerType || undefined,
                assigned_salesperson_id: assignedSalesperson || undefined,
              })
              onClose()
            }}
          >
            <Check size={12} /> Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
