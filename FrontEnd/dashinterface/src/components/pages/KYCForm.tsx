import { useState } from 'react'
import { Printer, Send, Loader2 } from 'lucide-react'
import type { Customer } from '../../mockData'
import { apiSendKyc } from '../../api'

interface KYCFormProps {
  customers: Customer[]
  onFlash: (msg: string) => void
}

export default function KYCForm({ customers, onFlash }: KYCFormProps) {
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  const [customerName, setCustomerName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [sending, setSending] = useState(false)

  const canSend = customerName.trim() && recipientEmail.trim() && recipientEmail.includes('@')

  const handleSendKyc = async () => {
    if (!canSend || sending) return
    setSending(true)
    try {
      const res = await apiSendKyc({
        customer_name: customerName.trim(),
        recipient_email: recipientEmail.trim(),
      })
      if (res.success) {
        onFlash(`KYC form sent to ${recipientEmail}`)
        setCustomerName('')
        setRecipientEmail('')
      } else {
        onFlash(`Failed to send KYC: ${res.message}`)
      }
    } catch {
      onFlash('Failed to send KYC — check backend connection')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="db-page-anim">
      {/* Screen-only header with print button */}
      <div className="db-page-head kyc-no-print">
        <div className="db-page-head-row">
          <div>
            <h1 className="db-page-title">KYC Form</h1>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              Generate a printable Know Your Customer form or email it directly to a customer
            </div>
          </div>
          <button
            className="db-btn primary"
            onClick={() => window.print()}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Printer size={14} /> Print / Save as PDF
          </button>
        </div>
      </div>

      {/* Send KYC via Email card (screen-only) */}
      <div className="db-chart-card kyc-no-print" style={{ marginBottom: 18 }}>
        <div className="db-chart-head">
          <div>
            <div className="db-chart-title">Send KYC Form via Email</div>
            <div className="db-chart-sub">Email the KYC form directly to a customer using Resend</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <label className="lt-label">Customer Name</label>
            <input
              list="kyc-customers"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Select or type customer name..."
              className="lt-input"
              style={{ width: '100%' }}
            />
            <datalist id="kyc-customers">
              {customers.map(c => <option key={c.id} value={c.name} />)}
            </datalist>
          </div>
          <div>
            <label className="lt-label">Recipient Email</label>
            <input
              type="email"
              value={recipientEmail}
              onChange={e => setRecipientEmail(e.target.value)}
              placeholder="customer@example.com"
              className="lt-input"
              style={{ width: '100%' }}
            />
          </div>
          <button
            className="db-btn primary"
            onClick={handleSendKyc}
            disabled={!canSend || sending}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: canSend && !sending ? 1 : 0.5,
              cursor: canSend && !sending ? 'pointer' : 'not-allowed',
              marginBottom: 1,
            }}
          >
            {sending ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
            {sending ? 'Sending...' : 'Send KYC'}
          </button>
        </div>
      </div>

      {/* ===== Printable form starts here ===== */}
      <div className="kyc-form">

        {/* Form header */}
        <div className="kyc-header">
          <div className="kyc-logo">
            <div className="kyc-logo-icon">L</div>
            <div>
              <div className="kyc-company-name">ABC Logistics (Pvt) Ltd</div>
              <div className="kyc-company-sub">Freight Forwarding &amp; Supply Chain Solutions</div>
            </div>
          </div>
          <div className="kyc-title-block">
            <h2 className="kyc-title">Know Your Customer (KYC) Form</h2>
            <div className="kyc-meta-row">
              <span>Date: {today}</span>
              <span>Ref: KYC-________</span>
            </div>
          </div>
        </div>

        <div className="kyc-instructions">
          Please complete all sections in <strong>BLOCK CAPITALS</strong>. Attach the required documents listed in Section C.
          Return the completed form to your designated Sales / Customer Service contact.
        </div>

        {/* Section A — Company Information */}
        <div className="kyc-section">
          <div className="kyc-section-title">Section A — Company Information</div>

          <div className="kyc-field-grid">
            <div className="kyc-field full">
              <label className="kyc-label">Company / Business Name</label>
              <div className="kyc-input-line" />
            </div>
            <div className="kyc-field full">
              <label className="kyc-label">Business Registration Number</label>
              <div className="kyc-input-line" />
            </div>

            <div className="kyc-field full">
              <label className="kyc-label">Registered Address</label>
              <div className="kyc-input-line" />
            </div>
            <div className="kyc-field half">
              <label className="kyc-label">City</label>
              <div className="kyc-input-line" />
            </div>
            <div className="kyc-field half">
              <label className="kyc-label">Country</label>
              <div className="kyc-input-line" />
            </div>
            <div className="kyc-field half">
              <label className="kyc-label">Postal Code</label>
              <div className="kyc-input-line" />
            </div>

            <div className="kyc-field half">
              <label className="kyc-label">Contact Person</label>
              <div className="kyc-input-line" />
            </div>
            <div className="kyc-field half">
              <label className="kyc-label">Designation</label>
              <div className="kyc-input-line" />
            </div>
            <div className="kyc-field half">
              <label className="kyc-label">Phone Number</label>
              <div className="kyc-input-line" />
            </div>
            <div className="kyc-field half">
              <label className="kyc-label">Email Address</label>
              <div className="kyc-input-line" />
            </div>
          </div>
        </div>

        {/* Section B — Trade Details */}
        <div className="kyc-section">
          <div className="kyc-section-title">Section B — Trade Details</div>

          <div className="kyc-field-grid">
            <div className="kyc-field full">
              <label className="kyc-label">Type of Business</label>
              <div className="kyc-checkbox-row">
                {['Importer', 'Exporter', 'Both', 'Freight Forwarder', 'Other'].map(opt => (
                  <label key={opt} className="kyc-checkbox-item">
                    <span className="kyc-checkbox-box" />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            <div className="kyc-field full">
              <label className="kyc-label">Primary Commodities Handled</label>
              <div className="kyc-input-line" />
            </div>

            <div className="kyc-field half">
              <label className="kyc-label">Estimated Monthly Shipment Volume</label>
              <div className="kyc-input-line" />
            </div>
            <div className="kyc-field half">
              <label className="kyc-label">Preferred Container Types</label>
              <div className="kyc-input-line" />
            </div>

            <div className="kyc-field full">
              <label className="kyc-label">Preferred Trade Lanes (Origin — Destination)</label>
              <div className="kyc-input-line" />
              <div className="kyc-input-line" style={{ marginTop: 8 }} />
            </div>

            {/* Trade references */}
            <div className="kyc-field full">
              <label className="kyc-label" style={{ marginBottom: 8 }}>Trade References</label>

              <div className="kyc-ref-table">
                <div className="kyc-ref-header">
                  <span>#</span>
                  <span>Company Name</span>
                  <span>Contact Person</span>
                  <span>Phone / Email</span>
                </div>
                {[1, 2].map(n => (
                  <div key={n} className="kyc-ref-row">
                    <span>{n}</span>
                    <div className="kyc-input-line" />
                    <div className="kyc-input-line" />
                    <div className="kyc-input-line" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section C — Documents Checklist */}
        <div className="kyc-section">
          <div className="kyc-section-title">Section C — Required Documents</div>
          <div className="kyc-instructions" style={{ marginBottom: 12 }}>
            Please attach certified copies of the following documents:
          </div>

          <div className="kyc-checklist">
            {[
              'Business Registration Certificate',
              'Tax / VAT Registration Certificate',
              'National ID or Passport copy of Authorized Signatory',
              'Proof of Address (utility bill or bank statement, not older than 3 months)',
            ].map((doc, i) => (
              <label key={i} className="kyc-checklist-item">
                <span className="kyc-checkbox-box" />
                {doc}
              </label>
            ))}
          </div>
        </div>

        {/* Section D — Declaration & Signature */}
        <div className="kyc-section">
          <div className="kyc-section-title">Section D — Declaration &amp; Signature</div>

          <div className="kyc-declaration">
            I hereby declare that the information provided in this form is true, complete, and accurate
            to the best of my knowledge. I understand that ABC Logistics (Pvt) Ltd reserves the right
            to verify any information provided and to request additional documentation as necessary.
            I agree to notify ABC Logistics promptly of any changes to the above information.
          </div>

          <div className="kyc-signature-grid">
            <div className="kyc-sig-block">
              <div className="kyc-sig-line" />
              <div className="kyc-sig-label">Authorized Signature</div>
            </div>
            <div className="kyc-sig-block">
              <div className="kyc-sig-line" />
              <div className="kyc-sig-label">Name &amp; Designation</div>
            </div>
            <div className="kyc-sig-block">
              <div className="kyc-sig-line" />
              <div className="kyc-sig-label">Date</div>
            </div>
            <div className="kyc-sig-block">
              <div className="kyc-stamp-box">Company Stamp</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="kyc-footer">
          <div>ABC Logistics (Pvt) Ltd — Confidential</div>
          <div>For internal use: Received by ____________ Date ____________ Verified by ____________</div>
        </div>

      </div>
    </div>
  )
}
