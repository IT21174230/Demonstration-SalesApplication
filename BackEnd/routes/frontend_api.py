"""
REST API routes for the frontend dashboard.

Serves transformed data from mock_data.json in the shapes the React
frontend expects. Follows the modular monolith pattern: dashboard
surface uses REST, chat surface uses WebSocket (unchanged).
"""
import os
import resend
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()
resend.api_key = os.getenv("RESEND_API", "")
from Utils.DB_Query.frontend_queries import (
    get_fe_customers, get_fe_inquiries, get_fe_tasks,
    get_fe_missing_items, get_fe_followups, get_fe_quotes,
    get_fe_shipments, get_fe_employees, get_fe_bookings,
    create_fe_inquiry, create_fe_followup, complete_fe_inquiry,
    reopen_fe_inquiry, create_fe_customer, update_fe_customer,
    create_fe_quote, update_fe_quote_status,
    create_fe_task, complete_fe_task,
    advance_fe_shipment_leg, record_fe_shipment_pod,
    create_fe_booking, confirm_fe_booking, release_fe_booking,
    notify_procurement_fe_booking,
    set_fe_booking_si_cutoff, mark_fe_booking_si_requested,
    set_fe_booking_bl_cutoff, mark_fe_booking_si_submitted,
    mark_fe_booking_draft_bl_sent, set_fe_booking_bl_status,
    record_fe_booking_master_bl, create_fe_booking_house_bl,
    simulate_inttra_si_submission,
    get_fe_activity_log, create_fe_activity,
    search_fe_rates, simulate_inttra_spot_rates, simulate_inttra_booking,
    update_fe_inquiry_stage,
)

router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# GET — Bulk load all dashboard data in one request
# ---------------------------------------------------------------------------

@router.get("/dashboard/init")
def dashboard_init():
    return {
        "customers": get_fe_customers(),
        "inquiries": get_fe_inquiries(),
        "tasks": get_fe_tasks(),
        "missing_items": get_fe_missing_items(),
        "followups": get_fe_followups(),
        "quotes": get_fe_quotes(),
        "shipments": get_fe_shipments(),
        "employees": get_fe_employees(),
        "bookings": get_fe_bookings(),
        "activity_log": get_fe_activity_log(),
    }


# ---------------------------------------------------------------------------
# Inquiries
# ---------------------------------------------------------------------------

class InquiryCreate(BaseModel):
    customer_name: str
    inquiry_text: str = ""
    request: str = ""
    origin: str = "TBD"
    destination: str = "TBD"
    delivery_type: str = "port-to-port"
    channel: str = "Email"
    sbu: str = "Ocean Exports"
    employee_id: int = 1


@router.post("/inquiries")
def create_inquiry(body: InquiryCreate):
    return create_fe_inquiry(body.model_dump())


@router.post("/inquiries/{fe_id}/complete")
def complete_inquiry(fe_id: str):
    result = complete_fe_inquiry(fe_id)
    if not result:
        raise HTTPException(404, "Inquiry not found or already completed")
    return result


class WorkflowStagePatch(BaseModel):
    stage: str


@router.patch("/inquiries/{fe_id}/workflow-stage")
def patch_workflow_stage(fe_id: str, body: WorkflowStagePatch):
    ok = update_fe_inquiry_stage(fe_id, body.stage)
    if not ok:
        raise HTTPException(404, f"Inquiry '{fe_id}' not found")
    return {"success": True}


class ReopenBody(BaseModel):
    customer_name: str
    note: str = ""


@router.post("/inquiries/reopen")
def reopen_inquiry(body: ReopenBody):
    ok = reopen_fe_inquiry(body.customer_name, body.note)
    if not ok:
        raise HTTPException(404, "No completed inquiry found for this customer")
    return {"success": True}


# ---------------------------------------------------------------------------
# Followups
# ---------------------------------------------------------------------------

class FollowupCreate(BaseModel):
    customer_name: str
    note: str = ""
    completion_flag: bool = False
    employee_id: int = 1


@router.post("/followups")
def create_followup(body: FollowupCreate):
    return create_fe_followup(body.model_dump())


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------

class CustomerCreate(BaseModel):
    name: str
    tier: str = "Regular"
    payment_terms: str = "Pay Upfront"
    location: str = "Colombo, Sri Lanka"


@router.post("/customers")
def create_customer(body: CustomerCreate):
    return create_fe_customer(body.model_dump())


class CustomerPatch(BaseModel):
    tier: str | None = None
    payment_terms: str | None = None
    location: str | None = None
    blacklisted: bool | None = None
    credit_hold: bool | None = None
    min_margin_pct: int | None = None
    notes: str | None = None
    kyc_status: str | None = None


@router.patch("/customers/{name}")
def patch_customer(name: str, body: CustomerPatch):
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(400, "No fields to update")
    ok = update_fe_customer(name, patch)
    if not ok:
        raise HTTPException(404, f"Customer '{name}' not found")
    return {"success": True}


# ---------------------------------------------------------------------------
# Rate Search
# ---------------------------------------------------------------------------

@router.get("/rates/search")
def rate_search(
    origin: str | None = None,
    destination: str | None = None,
    container_type: str | None = None,
    liner_name: str | None = None,
    rate_type: str | None = None,
):
    return search_fe_rates(
        origin=origin, destination=destination,
        container_type=container_type, liner_name=liner_name,
        rate_type=rate_type,
    )


# ---------------------------------------------------------------------------
# InttraAPI Spot Rates (simulated)
# ---------------------------------------------------------------------------

class InttraRateRequest(BaseModel):
    origin: str = ""
    destination: str = ""
    container_type: str = "20'GP"


@router.post("/inttra/spot-rates")
def inttra_spot_rates(body: InttraRateRequest):
    return simulate_inttra_spot_rates(
        origin=body.origin,
        destination=body.destination,
        container_type=body.container_type,
    )


class InttraBookingRequest(BaseModel):
    booking_id: str = ""
    shipping_line: str = ""
    origin: str = ""
    destination: str = ""
    container_type: str = "20'GP"
    quantity: int = 1


@router.post("/inttra/book")
def inttra_book(body: InttraBookingRequest):
    return simulate_inttra_booking(
        booking_id=body.booking_id,
        shipping_line=body.shipping_line,
        origin=body.origin,
        destination=body.destination,
        container_type=body.container_type,
        quantity=body.quantity,
    )


# ---------------------------------------------------------------------------
# Quotes
# ---------------------------------------------------------------------------

class QuoteLineCreate(BaseModel):
    id: str
    shipping_line: str
    rate_type: str = "Spot"
    base_rate_usd: float = 0
    transit_days: int = 0
    free_time_days: int = 0
    transshipment_points: str = "Direct"
    destination_charges_usd: float = 0


class QuoteCreate(BaseModel):
    customer_name: str
    origin: str = ""
    destination: str = ""
    quote_type: str = "FCA"
    margin_pct: float = 7
    created_by: int = 1
    inquiry_id: str | None = None
    lines: list[QuoteLineCreate] = []


@router.post("/quotes")
def create_quote(body: QuoteCreate):
    payload = body.model_dump()
    payload["lines"] = [line for line in payload["lines"]]
    return create_fe_quote(payload)


class QuoteStatusPatch(BaseModel):
    status: str


@router.patch("/quotes/{quote_id}/status")
def patch_quote_status(quote_id: str, body: QuoteStatusPatch):
    ok = update_fe_quote_status(quote_id, body.status)
    if not ok:
        raise HTTPException(404, f"Quote '{quote_id}' not found")
    return {"success": True}


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------

class TaskCreate(BaseModel):
    customer_name: str
    task: str = ""
    due_date: str = ""
    employee_id: int = 1


@router.post("/tasks")
def create_task(body: TaskCreate):
    return create_fe_task(body.model_dump())


@router.patch("/tasks/{fe_id}/complete")
def patch_complete_task(fe_id: str):
    ok = complete_fe_task(fe_id)
    if not ok:
        raise HTTPException(404, f"Task '{fe_id}' not found")
    return {"success": True}


# ---------------------------------------------------------------------------
# Shipments
# ---------------------------------------------------------------------------

@router.patch("/shipments/{shipment_id}/legs/{leg_id}")
def patch_advance_leg(shipment_id: str, leg_id: str):
    result = advance_fe_shipment_leg(shipment_id, leg_id)
    if not result:
        raise HTTPException(404, "Shipment or leg not found")
    return result


@router.patch("/shipments/{shipment_id}/pod")
def patch_record_pod(shipment_id: str):
    ok = record_fe_shipment_pod(shipment_id)
    if not ok:
        raise HTTPException(404, f"Shipment '{shipment_id}' not found")
    return {"success": True}


# ---------------------------------------------------------------------------
# Bookings
# ---------------------------------------------------------------------------

class BookingCreate(BaseModel):
    customer_name: str
    quote_id: str
    shipping_line: str = ""
    container_type: str = "20'GP"
    quantity: int = 1
    is_urgent: bool = False
    booked_by: int = 2
    delivery_type: str = "port-to-port"


@router.post("/bookings")
def create_booking(body: BookingCreate):
    return create_fe_booking(body.model_dump())


class BookingConfirm(BaseModel):
    vessel_name: str = ""
    voyage_number: str = ""
    confirmed_by: int = 5


@router.patch("/bookings/{booking_id}/confirm")
def patch_confirm_booking(booking_id: str, body: BookingConfirm):
    result = confirm_fe_booking(booking_id, body.vessel_name, body.voyage_number, body.confirmed_by)
    if not result:
        raise HTTPException(404, f"Booking '{booking_id}' not found")
    return result


class BookingRelease(BaseModel):
    note: str = ""
    released_by: int = 2


@router.patch("/bookings/{booking_id}/release")
def patch_release_booking(booking_id: str, body: BookingRelease):
    result = release_fe_booking(booking_id, body.note, body.released_by)
    if not result:
        raise HTTPException(404, f"Booking '{booking_id}' not found")
    return result


@router.patch("/bookings/{booking_id}/notify")
def patch_notify_procurement(booking_id: str):
    ok = notify_procurement_fe_booking(booking_id)
    if not ok:
        raise HTTPException(404, f"Booking '{booking_id}' not found")
    return {"success": True}


class BookingSiCutoff(BaseModel):
    si_cutoff_date: str = ""


@router.patch("/bookings/{booking_id}/si-cutoff")
def patch_si_cutoff(booking_id: str, body: BookingSiCutoff):
    ok = set_fe_booking_si_cutoff(booking_id, body.si_cutoff_date)
    if not ok:
        raise HTTPException(404, f"Booking '{booking_id}' not found")
    return {"success": True}


@router.patch("/bookings/{booking_id}/si-requested")
def patch_si_requested(booking_id: str):
    ok = mark_fe_booking_si_requested(booking_id)
    if not ok:
        raise HTTPException(404, f"Booking '{booking_id}' not found")
    return {"success": True}


class BookingBlCutoff(BaseModel):
    bl_cutoff_date: str = ""


@router.patch("/bookings/{booking_id}/bl-cutoff")
def patch_bl_cutoff(booking_id: str, body: BookingBlCutoff):
    ok = set_fe_booking_bl_cutoff(booking_id, body.bl_cutoff_date)
    if not ok:
        raise HTTPException(404, f"Booking '{booking_id}' not found")
    return {"success": True}


@router.patch("/bookings/{booking_id}/si-submitted")
def patch_si_submitted(booking_id: str):
    ok = mark_fe_booking_si_submitted(booking_id)
    if not ok:
        raise HTTPException(404, f"Booking '{booking_id}' not found")
    return {"success": True}


@router.patch("/bookings/{booking_id}/draft-bl-sent")
def patch_draft_bl_sent(booking_id: str):
    ok = mark_fe_booking_draft_bl_sent(booking_id)
    if not ok:
        raise HTTPException(404, f"Booking '{booking_id}' not found")
    return {"success": True}


class BookingBlStatus(BaseModel):
    status: str = "pending"


@router.patch("/bookings/{booking_id}/bl-status")
def patch_bl_status(booking_id: str, body: BookingBlStatus):
    ok = set_fe_booking_bl_status(booking_id, body.status)
    if not ok:
        raise HTTPException(404, f"Booking '{booking_id}' not found")
    return {"success": True}


class MasterBlData(BaseModel):
    master_bl_number: str = ""
    shipper: str = "Synergy Shipping & Logistics"
    consignee: str = ""


@router.patch("/bookings/{booking_id}/master-bl")
def patch_master_bl(booking_id: str, body: MasterBlData):
    ok = record_fe_booking_master_bl(booking_id, body.master_bl_number, body.shipper, body.consignee)
    if not ok:
        raise HTTPException(404, f"Booking '{booking_id}' not found")
    return {"success": True}


class HouseBlData(BaseModel):
    house_bl_number: str = ""
    shipper: str = ""
    consignee: str = ""


@router.patch("/bookings/{booking_id}/house-bl")
def patch_house_bl(booking_id: str, body: HouseBlData):
    ok = create_fe_booking_house_bl(booking_id, body.house_bl_number, body.shipper, body.consignee)
    if not ok:
        raise HTTPException(404, f"Booking '{booking_id}' not found")
    return {"success": True}


class InttraSiRequest(BaseModel):
    booking_id: str = ""
    shipping_line: str = ""
    origin: str = ""
    destination: str = ""


@router.post("/inttra/submit-si")
def inttra_submit_si(body: InttraSiRequest):
    return simulate_inttra_si_submission(
        booking_id=body.booking_id,
        shipping_line=body.shipping_line,
        origin=body.origin,
        destination=body.destination,
    )


# ---------------------------------------------------------------------------
# Activity Log
# ---------------------------------------------------------------------------

class ActivityCreate(BaseModel):
    actor_role: str = "CS"
    actor_id: int = 1
    action: str = ""
    ref_type: str = "inquiry"
    ref_id: str = ""
    customer_name: str = ""
    pushed_to: str = "CS"
    notes: str = ""


@router.post("/activity-log")
def post_activity(body: ActivityCreate):
    return create_fe_activity(body.model_dump())


# ---------------------------------------------------------------------------
# Email — Send KYC & Quotations via Resend
# ---------------------------------------------------------------------------

class SendKycBody(BaseModel):
    customer_name: str
    recipient_email: str


@router.post("/send-kyc")
def send_kyc(body: SendKycBody):
    today = datetime.now().strftime("%d %b %Y")
    kyc_html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; color: #1a1a2e;">
      <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px;">ABC Logistics (Pvt) Ltd</h1>
        <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0; font-size: 13px;">Freight Forwarding &amp; Supply Chain Solutions</p>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; padding: 28px 32px; border-radius: 0 0 12px 12px;">
        <h2 style="color: #1e293b; margin-top: 0;">Know Your Customer (KYC) Form</h2>
        <p style="color: #475569; font-size: 14px;">
          Dear <strong>{body.customer_name}</strong>,
        </p>
        <p style="color: #475569; font-size: 14px;">
          As part of our onboarding process, we kindly request you to complete the attached
          Know Your Customer (KYC) form. This is a regulatory requirement for all new business
          relationships.
        </p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="color: #1e293b; margin-top: 0; font-size: 15px;">Please provide:</h3>
          <ul style="color: #475569; font-size: 13px; line-height: 1.8;">
            <li><strong>Section A</strong> — Company Information (name, registration, address, contact person)</li>
            <li><strong>Section B</strong> — Trade Details (business type, commodities, shipment volume, trade references)</li>
            <li><strong>Section C</strong> — Required Documents:
              <ul>
                <li>Business Registration Certificate</li>
                <li>Tax / VAT Registration Certificate</li>
                <li>National ID or Passport copy of Authorized Signatory</li>
                <li>Proof of Address (utility bill or bank statement, not older than 3 months)</li>
              </ul>
            </li>
            <li><strong>Section D</strong> — Declaration &amp; Signature with Company Stamp</li>
          </ul>
        </div>
        <p style="color: #475569; font-size: 14px;">
          Please complete all sections in <strong>BLOCK CAPITALS</strong> and return the completed
          form along with the required documents to your designated Sales / Customer Service contact.
        </p>
        <p style="color: #64748b; font-size: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
          Date: {today}<br>
          This is an automated message from ABC Logistics (Pvt) Ltd — Confidential
        </p>
      </div>
    </div>
    """
    try:
        params: resend.Emails.SendParams = {
            "from": "ABC Logistics <onboarding@resend.dev>",
            "to": [body.recipient_email],
            "subject": f"KYC Form Request — {body.customer_name} — ABC Logistics",
            "html": kyc_html,
        }
        resend.Emails.send(params)
        return {"success": True, "message": f"KYC form sent to {body.recipient_email}"}
    except Exception as e:
        return {"success": False, "message": str(e)}


class SendQuotationBody(BaseModel):
    customer_name: str
    recipient_email: str
    quote_id: str
    quotation_content: str


@router.post("/send-quotation")
def send_quotation(body: SendQuotationBody):
    today = datetime.now().strftime("%d %b %Y")
    # Convert newlines in pasted content to HTML line breaks
    content_html = body.quotation_content.replace("\n", "<br>")
    quotation_html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; color: #1a1a2e;">
      <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px;">ABC Logistics (Pvt) Ltd</h1>
        <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0; font-size: 13px;">Freight Forwarding &amp; Supply Chain Solutions</p>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; padding: 28px 32px; border-radius: 0 0 12px 12px;">
        <h2 style="color: #1e293b; margin-top: 0;">Quotation — {body.quote_id}</h2>
        <p style="color: #475569; font-size: 14px;">
          Dear <strong>{body.customer_name}</strong>,
        </p>
        <p style="color: #475569; font-size: 14px;">
          Thank you for your inquiry. Please find our quotation details below:
        </p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; font-size: 13px; color: #334155; line-height: 1.7;">
          {content_html}
        </div>
        <p style="color: #475569; font-size: 14px;">
          This quotation is subject to our standard terms and conditions. Please feel free to
          contact us if you have any questions or require further clarification.
        </p>
        <p style="color: #475569; font-size: 14px;">
          We look forward to your confirmation.
        </p>
        <p style="color: #64748b; font-size: 12px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
          Ref: {body.quote_id} · Date: {today}<br>
          This is an automated message from ABC Logistics (Pvt) Ltd — Confidential
        </p>
      </div>
    </div>
    """
    try:
        params: resend.Emails.SendParams = {
            "from": "ABC Logistics <onboarding@resend.dev>",
            "to": [body.recipient_email],
            "subject": f"Quotation {body.quote_id} — {body.customer_name} — ABC Logistics",
            "html": quotation_html,
        }
        resend.Emails.send(params)
        return {"success": True, "message": f"Quotation {body.quote_id} sent to {body.recipient_email}"}
    except Exception as e:
        return {"success": False, "message": str(e)}
