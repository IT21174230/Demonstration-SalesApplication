"""
Frontend-facing query layer.

Transforms backend mock_data.json records (int IDs, customer_id FKs,
backend status enums) into the shapes the React frontend expects
(string IDs, customer_name, frontend status enums).

Reuses _load_data / _save_data from queries.py.
"""
from __future__ import annotations

from datetime import datetime, timezone
from .queries import _load_data, _save_data


# ---------------------------------------------------------------------------
# ID mapping helpers
# ---------------------------------------------------------------------------

def _customer_fe_id(backend_id: int) -> str:
    return f"CUS-{backend_id:03d}"


def _inquiry_fe_id(backend_id: int, fe_id_override: str | None = None) -> str:
    """Use the explicit fe_id if stored on the record, otherwise auto-generate.
    Non-seed inquiries get IDs in the 2000+ range to avoid colliding with seed IDs (1036-1041)."""
    if fe_id_override:
        return fe_id_override
    return f"INQ-{2000 + backend_id}"


def _inquiry_backend_id_from_data(fe_id: str, data: dict) -> int | None:
    """Resolve a frontend inquiry ID back to the backend int ID."""
    for i in data.get("inquiries", []):
        if i.get("fe_id") == fe_id:
            return i["id"]
    # Fallback to formula
    try:
        num = int(fe_id.split("-")[1])
        return num + 3972
    except (ValueError, IndexError):
        return None


def _task_fe_id(backend_id: int) -> str:
    return f"TSK-{backend_id + 200}"


def _task_backend_id(fe_id: str) -> int:
    return int(fe_id.split("-")[1]) - 200


def _followup_fe_id(backend_id: int) -> str:
    return f"FUP-{backend_id + 400}"


def _followup_backend_id(fe_id: str) -> int:
    return int(fe_id.split("-")[1]) - 400


def _missing_fe_id(backend_id: int) -> str:
    return f"MIS-{backend_id + 300}"


def _resolve_inquiry_fe_id(backend_id: int, data: dict) -> str:
    """Look up the fe_id for a backend inquiry ID, using explicit fe_id if stored."""
    for i in data.get("inquiries", []):
        if i["id"] == backend_id and i.get("fe_id"):
            return i["fe_id"]
    return _inquiry_fe_id(backend_id)


def _now_stamp() -> str:
    now = datetime.now()
    return f"{now.strftime('%Y-%m-%d')} {now.strftime('%H:%M')}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Status mapping
# ---------------------------------------------------------------------------

_STATUS_TO_FE = {
    "new": "pending",
    "verified": "pending",
    "in_pricing": "pending",
    "quoted": "completed",
    "dropped": "completed",
}


def _inquiry_status_to_fe(backend_status: str) -> str:
    return _STATUS_TO_FE.get(backend_status, "pending")


# ---------------------------------------------------------------------------
# Internal: build customer name lookup from loaded data
# ---------------------------------------------------------------------------

def _customer_name_map(data: dict) -> dict[int, str]:
    return {c["id"]: c["name"] for c in data.get("customers", [])}


# ---------------------------------------------------------------------------
# READ functions — return frontend-shaped dicts
# ---------------------------------------------------------------------------

def get_fe_customers() -> list[dict]:
    data = _load_data()
    result = []
    for c in data.get("customers", []):
        result.append({
            "id": _customer_fe_id(c["id"]),
            "name": c["name"],
            "location": c.get("location", "Colombo, Sri Lanka"),
            "tier": c.get("tier", "Walk-in"),
            "payment_terms": c.get("payment_terms", "Pay Upfront"),
            "blacklisted": c.get("blacklisted", False),
            "credit_hold": c.get("credit_hold", False),
            "min_margin_pct": c.get("min_margin_pct", 10),
            "notes": c.get("notes"),
            "kyc_status": c.get("kyc_status", "approved"),
            "contact_email": c.get("contact_email"),
            "contact_phone": c.get("contact_phone"),
        })
    return result


def get_fe_inquiries() -> list[dict]:
    data = _load_data()
    names = _customer_name_map(data)
    result = []
    for i in data.get("inquiries", []):
        fe_status = _inquiry_status_to_fe(i.get("status", "new"))
        # Convert received_at (ISO) to frontend format "YYYY-MM-DD HH:MM"
        raw_date = i.get("received_at", "")
        if "T" in raw_date:
            created_at = raw_date[:10] + " " + raw_date[11:16]
        else:
            created_at = raw_date

        rec = {
            "id": _inquiry_fe_id(i["id"], i.get("fe_id")),
            "customer_name": names.get(i.get("customer_id", 0), "Unknown"),
            "inquiry_text": i.get("inquiry_text", i.get("commodity", "")),
            "request": i.get("request", f"{i.get('quantity', '')} {i.get('container_type', '')}".strip()),
            "origin": i.get("origin", "TBD"),
            "destination": i.get("destination", "TBD"),
            "delivery_type": i.get("delivery_type", "port-to-port"),
            "channel": _map_channel(i.get("channel", "email")),
            "sbu": i.get("sbu", "Ocean Exports"),
            "employee_id": i.get("received_by_party_id", 1),
            "status": fe_status,
            "created_at": created_at,
            "workflow_stage": i.get("workflow_stage", "inquiry-received"),
        }
        # Add completion fields for completed inquiries
        if fe_status == "completed":
            # Use process instance completed_at if available, else use received_at
            completed_at = i.get("completed_at")
            if not completed_at:
                # Look for a matching completion followup
                for f in data.get("followups", []):
                    if f.get("inquiry_id") == i["id"] and f.get("completion_flag"):
                        completed_at = f.get("created_at", "")
                        break
            if completed_at and "T" in str(completed_at):
                completed_at = str(completed_at)[:10] + " " + str(completed_at)[11:16]
            rec["completed_at"] = completed_at
            # Find followup note
            for f in data.get("followups", []):
                if f.get("inquiry_id") == i["id"] and f.get("completion_flag"):
                    rec["followup_note"] = f.get("note", "")
                    break
        result.append(rec)
    return result


def _map_channel(ch: str) -> str:
    ch_lower = ch.lower()
    if "whatsapp" in ch_lower:
        return "WhatsApp"
    if "phone" in ch_lower or "call" in ch_lower:
        return "Phone"
    return "Email"


def get_fe_tasks() -> list[dict]:
    data = _load_data()
    names = _customer_name_map(data)
    result = []
    for t in data.get("tasks", []):
        result.append({
            "id": _task_fe_id(t["id"]),
            "customer_name": names.get(t.get("customer_id", 0), "Unknown"),
            "task": t.get("task", ""),
            "status": t.get("status", "pending"),
            "due_date": t.get("due_date", ""),
            "employee_id": t.get("employee_id", 1),
            "inquiry_id": _resolve_inquiry_fe_id(t["inquiry_id"], data) if t.get("inquiry_id") else None,
        })
    return result


def get_fe_missing_items() -> list[dict]:
    data = _load_data()
    names = _customer_name_map(data)
    result = []
    for m in data.get("missing_items", []):
        result.append({
            "id": _missing_fe_id(m["id"]),
            "customer_name": names.get(m.get("customer_id", 0), "Unknown"),
            "missing_item": m.get("missing_item", ""),
            "since": m.get("since", ""),
            "cutoff_date": m.get("cutoff_date"),
            "employee_id": m.get("employee_id", 1),
        })
    return result


def get_fe_followups() -> list[dict]:
    data = _load_data()
    names = _customer_name_map(data)
    result = []
    for f in data.get("followups", []):
        raw_date = f.get("created_at", "")
        if "T" in str(raw_date):
            created_at = str(raw_date)[:10] + " " + str(raw_date)[11:16]
        else:
            created_at = raw_date
        result.append({
            "id": _followup_fe_id(f["id"]),
            "inquiry_id": _resolve_inquiry_fe_id(f["inquiry_id"], data) if f.get("inquiry_id") else None,
            "customer_name": names.get(f.get("customer_id", 0), "Unknown"),
            "note": f.get("note", ""),
            "employee_id": f.get("employee_id", 1),
            "created_at": created_at,
            "completion_flag": f.get("completion_flag", False),
        })
    return result


def get_fe_quotes() -> list[dict]:
    """Read from fe_quotes table — already in frontend shape, just resolve customer_name."""
    data = _load_data()
    names = _customer_name_map(data)
    result = []
    for q in data.get("fe_quotes", []):
        rec = {**q}
        rec["customer_name"] = names.get(q.get("customer_id", 0), "Unknown")
        # Remove backend-only field
        rec.pop("customer_id", None)
        result.append(rec)
    return result


def get_fe_shipments() -> list[dict]:
    """Read from shipments table — resolve customer_name."""
    data = _load_data()
    names = _customer_name_map(data)
    result = []
    for s in data.get("shipments", []):
        rec = {**s}
        rec["customer_name"] = names.get(s.get("customer_id", 0), "Unknown")
        rec.pop("customer_id", None)
        result.append(rec)
    return result


def get_fe_employees() -> list[dict]:
    data = _load_data()
    return [
        {"id": e["id"], "name": e["name"], "role": e["role"]}
        for e in data.get("employees", [])
    ]


# ---------------------------------------------------------------------------
# WRITE functions
# ---------------------------------------------------------------------------

def create_fe_inquiry(payload: dict) -> dict:
    """
    Create a new inquiry from frontend data.
    payload: { customer_name, inquiry_text, request, origin, destination, channel, sbu, employee_id }
    """
    data = _load_data()
    customers = data.get("customers", [])
    inquiries = data.setdefault("inquiries", [])

    # Resolve customer_name -> customer_id
    cust = next((c for c in customers if c["name"].lower() == payload.get("customer_name", "").lower()), None)
    customer_id = cust["id"] if cust else 0

    next_id = max((i["id"] for i in inquiries), default=5000) + 1
    now = _now_iso()

    # Existing customers (KYC approved) go to CS for AMS rate check first
    if cust and cust.get("kyc_status") == "approved":
        initial_stage = "rate-check"
    else:
        initial_stage = "inquiry-received"

    new_inq = {
        "id": next_id,
        "customer_id": customer_id,
        "channel": payload.get("channel", "email").lower(),
        "origin": payload.get("origin", "TBD"),
        "destination": payload.get("destination", "TBD"),
        "delivery_type": payload.get("delivery_type", "port-to-port"),
        "commodity": payload.get("request", ""),
        "container_type": "N/A",
        "quantity": 1,
        "status": "new",
        "received_at": now,
        "received_by_party_id": payload.get("employee_id", 1),
        "inquiry_text": payload.get("inquiry_text", ""),
        "request": payload.get("request", ""),
        "sbu": payload.get("sbu", "Ocean Exports"),
        "workflow_stage": initial_stage,
    }
    inquiries.insert(0, new_inq)
    _save_data(data)

    # Return frontend-shaped record
    names = _customer_name_map(data)
    return {
        "id": _inquiry_fe_id(next_id),
        "customer_name": names.get(customer_id, payload.get("customer_name", "Unknown")),
        "inquiry_text": new_inq["inquiry_text"],
        "request": new_inq["request"],
        "origin": new_inq["origin"],
        "destination": new_inq["destination"],
        "delivery_type": new_inq.get("delivery_type", "port-to-port"),
        "channel": _map_channel(new_inq["channel"]),
        "sbu": new_inq["sbu"],
        "employee_id": new_inq["received_by_party_id"],
        "status": "pending",
        "created_at": _now_stamp(),
        "workflow_stage": initial_stage,
    }


def create_fe_followup(payload: dict) -> dict:
    """
    Create a followup. If completion_flag=true, also marks linked inquiry completed.
    payload: { customer_name, note, completion_flag, employee_id, inquiry_id? }
    """
    data = _load_data()
    followups = data.setdefault("followups", [])
    inquiries = data.get("inquiries", [])
    customers = data.get("customers", [])

    customer_name = payload.get("customer_name", "")
    completion_flag = payload.get("completion_flag", False)

    # Resolve customer_id
    cust = next((c for c in customers if c["name"].lower() == customer_name.lower()), None)
    customer_id = cust["id"] if cust else 0

    # Find the linked inquiry
    target_inq = None
    if completion_flag:
        # Find most recent pending inquiry for this customer
        for i in inquiries:
            if i.get("customer_id") == customer_id and _inquiry_status_to_fe(i.get("status", "")) == "pending":
                target_inq = i
                break

    next_id = max((f["id"] for f in followups), default=0) + 1
    now = _now_iso()

    new_fup = {
        "id": next_id,
        "inquiry_id": target_inq["id"] if target_inq else None,
        "customer_id": customer_id,
        "note": payload.get("note", "Follow-up logged"),
        "employee_id": payload.get("employee_id", 1),
        "created_at": now,
        "completion_flag": completion_flag,
    }
    followups.insert(0, new_fup)

    # If completion, mark the inquiry as quoted (=completed in frontend)
    if completion_flag and target_inq:
        target_inq["status"] = "quoted"
        target_inq["completed_at"] = now

    _save_data(data)

    names = _customer_name_map(data)
    stamp = _now_stamp()
    return {
        "id": _followup_fe_id(next_id),
        "inquiry_id": _inquiry_fe_id(target_inq["id"]) if target_inq else None,
        "customer_name": names.get(customer_id, customer_name),
        "note": new_fup["note"],
        "employee_id": new_fup["employee_id"],
        "created_at": stamp,
        "completion_flag": completion_flag,
    }


def complete_fe_inquiry(fe_id: str) -> dict | None:
    """Mark an inquiry as completed by its frontend ID."""
    data = _load_data()
    backend_id = _inquiry_backend_id_from_data(fe_id, data)
    inquiries = data.get("inquiries", [])
    target = next((i for i in inquiries if i["id"] == backend_id), None) if backend_id else None
    if not target or _inquiry_status_to_fe(target.get("status", "")) == "completed":
        return None

    now = _now_iso()
    target["status"] = "quoted"
    target["completed_at"] = now

    # Create a completion followup
    followups = data.setdefault("followups", [])
    next_fup_id = max((f["id"] for f in followups), default=0) + 1
    new_fup = {
        "id": next_fup_id,
        "inquiry_id": backend_id,
        "customer_id": target.get("customer_id", 0),
        "note": "Marked complete from list",
        "employee_id": target.get("received_by_party_id", 1),
        "created_at": now,
        "completion_flag": True,
    }
    followups.insert(0, new_fup)
    _save_data(data)
    return {"success": True, "id": fe_id}


def reopen_fe_inquiry(customer_name: str, note: str) -> bool:
    """Reopen the most recent completed inquiry for a customer."""
    data = _load_data()
    customers = data.get("customers", [])
    inquiries = data.get("inquiries", [])
    followups = data.setdefault("followups", [])

    cust = next((c for c in customers if c["name"].lower() == customer_name.lower()), None)
    if not cust:
        return False

    target = None
    for i in inquiries:
        if i.get("customer_id") == cust["id"] and _inquiry_status_to_fe(i.get("status", "")) == "completed":
            target = i
            break
    if not target:
        return False

    # Set back to pending
    target["status"] = "new"
    target.pop("completed_at", None)

    # Remove prior closing followup
    data["followups"] = [
        f for f in followups
        if not (f.get("inquiry_id") == target["id"] and f.get("completion_flag"))
    ]

    # Add reopen followup
    next_fup_id = max((f["id"] for f in data["followups"]), default=0) + 1
    new_fup = {
        "id": next_fup_id,
        "inquiry_id": target["id"],
        "customer_id": cust["id"],
        "note": note or "Reopened -- set back to pending",
        "employee_id": target.get("received_by_party_id", 1),
        "created_at": _now_iso(),
        "completion_flag": False,
    }
    data["followups"].insert(0, new_fup)
    _save_data(data)
    return True


def update_fe_inquiry_stage(fe_id: str, stage: str) -> bool:
    """Update the workflow_stage of an inquiry by its frontend ID."""
    data = _load_data()
    backend_id = _inquiry_backend_id_from_data(fe_id, data)
    inquiries = data.get("inquiries", [])
    target = next((i for i in inquiries if i["id"] == backend_id), None) if backend_id else None
    if not target:
        return False
    target["workflow_stage"] = stage
    _save_data(data)
    return True


def create_fe_customer(payload: dict) -> dict:
    """
    Create a new customer with frontend fields.
    payload: { name, tier, payment_terms, location? }
    """
    data = _load_data()
    customers = data.setdefault("customers", [])
    next_id = max((c["id"] for c in customers), default=0) + 1

    tier = payload.get("tier", "Regular")
    margin = 10 if tier == "Walk-in" else 7 if tier == "Regular" else 5

    new_cust = {
        "id": next_id,
        "name": payload["name"].strip(),
        "customer_type": "new",
        "contact_email": "",
        "contact_phone": "",
        "kyc_status": "not_started",
        "kyc_completed_at": None,
        "created_at": _now_iso(),
        "tier": tier,
        "payment_terms": payload.get("payment_terms", "Pay Upfront"),
        "location": payload.get("location", "Colombo, Sri Lanka").strip(),
        "blacklisted": False,
        "credit_hold": False,
        "min_margin_pct": margin,
    }
    customers.append(new_cust)
    _save_data(data)

    return {
        "id": _customer_fe_id(next_id),
        "name": new_cust["name"],
        "location": new_cust["location"],
        "tier": new_cust["tier"],
        "payment_terms": new_cust["payment_terms"],
        "blacklisted": False,
        "credit_hold": False,
        "min_margin_pct": margin,
    }


def update_fe_customer(name: str, patch: dict) -> bool:
    """Update a customer by name (case-insensitive). Returns True on success."""
    data = _load_data()
    customers = data.get("customers", [])
    target = next((c for c in customers if c["name"].lower() == name.lower()), None)
    if not target:
        return False

    # Apply patch — only allow known fields
    allowed = {"tier", "payment_terms", "location", "blacklisted", "credit_hold", "min_margin_pct", "notes", "kyc_status"}
    for k, v in patch.items():
        if k in allowed:
            target[k] = v

    _save_data(data)
    return True


def create_fe_quote(payload: dict) -> dict:
    """
    Create a quote in fe_quotes table.
    payload: { customer_name, origin, destination, quote_type, margin_pct, created_by, inquiry_id?, lines[] }
    Auto-routes to 'Awaiting Approval' if margin < customer min_margin_pct.
    """
    data = _load_data()
    fe_quotes = data.setdefault("fe_quotes", [])
    customers = data.get("customers", [])

    customer_name = payload.get("customer_name", "")
    cust = next((c for c in customers if c["name"].lower() == customer_name.lower()), None)
    customer_id = cust["id"] if cust else 0

    margin_pct = payload.get("margin_pct", 7)
    needs_approval = cust and margin_pct < cust.get("min_margin_pct", 10)

    # Generate next quote ID
    existing_nums = []
    for q in fe_quotes:
        try:
            existing_nums.append(int(q["id"].split("-")[1]))
        except (ValueError, IndexError):
            pass
    next_num = max(existing_nums, default=501) + 1
    quote_id = f"QUO-{next_num}"

    new_quote = {
        "id": quote_id,
        "inquiry_id": payload.get("inquiry_id"),
        "customer_id": customer_id,
        "origin": payload.get("origin", ""),
        "destination": payload.get("destination", ""),
        "quote_type": payload.get("quote_type", "FCA"),
        "margin_pct": margin_pct,
        "status": "Awaiting Approval" if needs_approval else "Draft",
        "created_at": _now_stamp(),
        "created_by": payload.get("created_by", 1),
        "approver_id": None,
        "approval_reason": f"margin {margin_pct}% < min {cust['min_margin_pct']}%" if needs_approval else None,
        "lines": payload.get("lines", []),
    }
    fe_quotes.insert(0, new_quote)
    _save_data(data)

    # Return frontend-shaped (resolve customer_name)
    names = _customer_name_map(data)
    result = {**new_quote}
    result["customer_name"] = names.get(customer_id, customer_name)
    result.pop("customer_id", None)
    return result


def update_fe_quote_status(quote_id: str, status: str) -> bool:
    data = _load_data()
    fe_quotes = data.get("fe_quotes", [])
    target = next((q for q in fe_quotes if q["id"] == quote_id), None)
    if not target:
        return False
    target["status"] = status
    _save_data(data)
    return True


def create_fe_task(payload: dict) -> dict:
    """
    payload: { customer_name, task, due_date, employee_id }
    """
    data = _load_data()
    tasks = data.setdefault("tasks", [])
    customers = data.get("customers", [])

    customer_name = payload.get("customer_name", "")
    cust = next((c for c in customers if c["name"].lower() == customer_name.lower()), None)
    customer_id = cust["id"] if cust else 0

    next_id = max((t["id"] for t in tasks), default=0) + 1

    new_task = {
        "id": next_id,
        "customer_id": customer_id,
        "task": payload.get("task", ""),
        "status": "pending",
        "due_date": payload.get("due_date", ""),
        "employee_id": payload.get("employee_id", 1),
    }
    tasks.insert(0, new_task)
    _save_data(data)

    names = _customer_name_map(data)
    return {
        "id": _task_fe_id(next_id),
        "customer_name": names.get(customer_id, customer_name),
        "task": new_task["task"],
        "status": "pending",
        "due_date": new_task["due_date"],
        "employee_id": new_task["employee_id"],
    }


def complete_fe_task(fe_id: str) -> bool:
    data = _load_data()
    backend_id = _task_backend_id(fe_id)
    tasks = data.get("tasks", [])
    target = next((t for t in tasks if t["id"] == backend_id), None)
    if not target:
        return False
    target["status"] = "completed"
    _save_data(data)
    return True


def advance_fe_shipment_leg(shipment_id: str, leg_id: str) -> dict | None:
    """
    Advance a shipment leg: Pending -> Arrived -> Departed (Destination stops at Arrived).
    Recomputes aggregate shipment status from legs.
    """
    data = _load_data()
    shipments = data.get("shipments", [])
    target = next((s for s in shipments if s["id"] == shipment_id), None)
    if not target:
        return None

    for leg in target.get("legs", []):
        if leg["id"] != leg_id:
            continue
        if leg["status"] == "Pending":
            leg["status"] = "Arrived"
            leg["actual_at"] = datetime.now().strftime("%Y-%m-%d")
        elif leg["status"] == "Arrived" and leg.get("type") != "Destination":
            leg["status"] = "Departed"

    # Recompute aggregate status
    legs = target.get("legs", [])
    all_delivered = all(
        l.get("type") != "Destination" or l.get("status") == "Arrived"
        for l in legs
    )
    at_transshipment = any(
        l.get("type") == "Transshipment" and l.get("status") == "Arrived"
        for l in legs
    )

    if all_delivered:
        target["status"] = "Delivered"
    elif at_transshipment:
        target["status"] = "At Transshipment"
    else:
        target["status"] = "In Transit"

    _save_data(data)

    # Return frontend-shaped
    names = _customer_name_map(data)
    result = {**target}
    result["customer_name"] = names.get(target.get("customer_id", 0), "Unknown")
    result.pop("customer_id", None)
    return result


def record_fe_shipment_pod(shipment_id: str) -> bool:
    data = _load_data()
    shipments = data.get("shipments", [])
    target = next((s for s in shipments if s["id"] == shipment_id), None)
    if not target:
        return False
    target["status"] = "Delivered"
    target["pod_received"] = _now_stamp()
    _save_data(data)
    return True


# ---------------------------------------------------------------------------
# Bookings
# ---------------------------------------------------------------------------

def get_fe_bookings() -> list[dict]:
    """Read from bookings table — resolve customer_name."""
    data = _load_data()
    names = _customer_name_map(data)
    result = []
    for b in data.get("bookings", []):
        rec = {**b}
        rec["customer_name"] = names.get(b.get("customer_id", 0), "Unknown")
        rec.pop("customer_id", None)
        result.append(rec)
    return result


def create_fe_booking(payload: dict) -> dict:
    """
    Create a booking from a confirmed quote.
    payload: { customer_name, quote_id, shipping_line, container_type, quantity, is_urgent, booked_by }
    If is_urgent=True, status starts at 'Liner Confirmed' and procurement_notified=False.
    Otherwise status starts at 'Pending Liner'.
    """
    data = _load_data()
    bookings = data.setdefault("bookings", [])
    customers = data.get("customers", [])

    customer_name = payload.get("customer_name", "")
    cust = next((c for c in customers if c["name"].lower() == customer_name.lower()), None)
    customer_id = cust["id"] if cust else 0

    is_urgent = payload.get("is_urgent", False)
    now = _now_stamp()

    # Generate next booking ID
    existing_nums = []
    for b in bookings:
        try:
            existing_nums.append(int(b["id"].split("-")[1]))
        except (ValueError, IndexError):
            pass
    next_num = max(existing_nums, default=899) + 1
    booking_id = f"BKG-{next_num}"

    # Resolve quote details for origin/destination
    quote_id = payload.get("quote_id", "")
    fe_quotes = data.get("fe_quotes", [])
    quote = next((q for q in fe_quotes if q["id"] == quote_id), None)

    new_booking = {
        "id": booking_id,
        "quote_id": quote_id,
        "customer_id": customer_id,
        "origin": quote["origin"] if quote else payload.get("origin", ""),
        "destination": quote["destination"] if quote else payload.get("destination", ""),
        "shipping_line": payload.get("shipping_line", ""),
        "vessel_name": "",
        "voyage_number": "",
        "container_type": payload.get("container_type", "20'GP"),
        "quantity": payload.get("quantity", 1),
        "status": "Liner Confirmed" if is_urgent else "Pending Liner",
        "is_urgent": is_urgent,
        "booked_by": payload.get("booked_by", 2),
        "confirmed_by": payload.get("booked_by", 2) if is_urgent else None,
        "released_by": None,
        "created_at": now,
        "confirmed_at": now if is_urgent else None,
        "released_at": None,
        "procurement_notified": not is_urgent,
        "notes": "Urgent booking — CS booked directly with liner" if is_urgent else "",
        "delivery_type": payload.get("delivery_type", "port-to-port"),
    }
    bookings.insert(0, new_booking)
    _save_data(data)

    names = _customer_name_map(data)
    result = {**new_booking}
    result["customer_name"] = names.get(customer_id, customer_name)
    result.pop("customer_id", None)
    return result


def confirm_fe_booking(booking_id: str, vessel_name: str = "", voyage_number: str = "", confirmed_by: int = 5) -> dict | None:
    """Procurement confirms liner space for a booking."""
    data = _load_data()
    bookings = data.get("bookings", [])
    target = next((b for b in bookings if b["id"] == booking_id), None)
    if not target:
        return None

    target["status"] = "Liner Confirmed"
    target["confirmed_at"] = _now_stamp()
    target["confirmed_by"] = confirmed_by
    if vessel_name:
        target["vessel_name"] = vessel_name
    if voyage_number:
        target["voyage_number"] = voyage_number
    _save_data(data)

    names = _customer_name_map(data)
    result = {**target}
    result["customer_name"] = names.get(target.get("customer_id", 0), "Unknown")
    result.pop("customer_id", None)
    return result


def release_fe_booking(booking_id: str, note: str = "", released_by: int = 2) -> dict | None:
    """CS releases container/instructions to the customer."""
    data = _load_data()
    bookings = data.get("bookings", [])
    target = next((b for b in bookings if b["id"] == booking_id), None)
    if not target:
        return None

    target["status"] = "Released"
    target["released_at"] = _now_stamp()
    target["released_by"] = released_by
    if note:
        target["notes"] = note
    _save_data(data)

    names = _customer_name_map(data)
    result = {**target}
    result["customer_name"] = names.get(target.get("customer_id", 0), "Unknown")
    result.pop("customer_id", None)
    return result


def notify_procurement_fe_booking(booking_id: str) -> bool:
    """Mark an urgent booking as procurement-notified."""
    data = _load_data()
    bookings = data.get("bookings", [])
    target = next((b for b in bookings if b["id"] == booking_id), None)
    if not target:
        return False
    target["procurement_notified"] = True
    _save_data(data)
    return True


def set_fe_booking_si_cutoff(booking_id: str, si_cutoff_date: str) -> bool:
    """Set the SI cutoff date for a booking."""
    data = _load_data()
    bookings = data.get("bookings", [])
    target = next((b for b in bookings if b["id"] == booking_id), None)
    if not target:
        return False
    target["si_cutoff_date"] = si_cutoff_date
    _save_data(data)
    return True


def mark_fe_booking_si_requested(booking_id: str) -> bool:
    """Mark an SI request as sent for a booking."""
    data = _load_data()
    bookings = data.get("bookings", [])
    target = next((b for b in bookings if b["id"] == booking_id), None)
    if not target:
        return False
    target["si_requested"] = True
    _save_data(data)
    return True


def set_fe_booking_bl_cutoff(booking_id: str, bl_cutoff_date: str) -> bool:
    """Set the BL cutoff date for a booking."""
    data = _load_data()
    bookings = data.get("bookings", [])
    target = next((b for b in bookings if b["id"] == booking_id), None)
    if not target:
        return False
    target["bl_cutoff_date"] = bl_cutoff_date
    _save_data(data)
    return True


def mark_fe_booking_si_submitted(booking_id: str) -> bool:
    """Mark SI as submitted to the liner for a booking."""
    data = _load_data()
    bookings = data.get("bookings", [])
    target = next((b for b in bookings if b["id"] == booking_id), None)
    if not target:
        return False
    target["si_submitted"] = True
    _save_data(data)
    return True


def mark_fe_booking_draft_bl_sent(booking_id: str) -> bool:
    """Mark Draft BL as sent to the customer for a booking."""
    data = _load_data()
    bookings = data.get("bookings", [])
    target = next((b for b in bookings if b["id"] == booking_id), None)
    if not target:
        return False
    target["draft_bl_sent"] = True
    _save_data(data)
    return True


def set_fe_booking_bl_status(booking_id: str, status: str) -> bool:
    """Set the BL approval status for a booking."""
    data = _load_data()
    bookings = data.get("bookings", [])
    target = next((b for b in bookings if b["id"] == booking_id), None)
    if not target:
        return False
    target["bl_status"] = status
    _save_data(data)
    return True


def record_fe_booking_master_bl(booking_id: str, master_bl_number: str, shipper: str, consignee: str) -> bool:
    """Record the Master BL details for a door-to-door booking."""
    data = _load_data()
    bookings = data.get("bookings", [])
    target = next((b for b in bookings if b["id"] == booking_id), None)
    if not target:
        return False
    target["master_bl_number"] = master_bl_number
    target["master_bl_shipper"] = shipper
    target["master_bl_consignee"] = consignee
    target["master_bl_recorded"] = True
    _save_data(data)
    return True


def create_fe_booking_house_bl(booking_id: str, house_bl_number: str, shipper: str, consignee: str) -> bool:
    """Create a House BL for a door-to-door booking."""
    data = _load_data()
    bookings = data.get("bookings", [])
    target = next((b for b in bookings if b["id"] == booking_id), None)
    if not target:
        return False
    target["house_bl_number"] = house_bl_number
    target["house_bl_shipper"] = shipper
    target["house_bl_consignee"] = consignee
    target["house_bl_created"] = True
    _save_data(data)
    return True


def simulate_inttra_si_submission(
    booking_id: str = "",
    shipping_line: str = "",
    origin: str = "",
    destination: str = "",
) -> dict:
    """Simulate an InttraAPI SI submission. Returns a mock confirmation."""
    import hashlib

    seed = hashlib.md5(f"SI-{booking_id}{shipping_line}{origin}{destination}".encode()).hexdigest()
    si_ref = f"SI-{seed[:8].upper()}"

    return {
        "success": True,
        "si_reference": si_ref,
        "booking_id": booking_id,
        "shipping_line": shipping_line or "Maersk Line",
        "status": "Submitted",
        "message": f"SI submitted to {shipping_line or 'carrier'} via InttraAPI. Reference: {si_ref}.",
    }


# ---------------------------------------------------------------------------
# Activity Log
# ---------------------------------------------------------------------------

def get_fe_activity_log() -> list[dict]:
    """Read activity_log entries — already in frontend shape."""
    data = _load_data()
    result = []
    for a in data.get("activity_log", []):
        result.append({
            "id": f"ACT-{a['id']:03d}",
            "timestamp": a.get("timestamp", ""),
            "actor_role": a.get("actor_role", "CS"),
            "actor_id": a.get("actor_id", 1),
            "action": a.get("action", ""),
            "ref_type": a.get("ref_type", "inquiry"),
            "ref_id": a.get("ref_id", ""),
            "customer_name": a.get("customer_name", ""),
            "pushed_to": a.get("pushed_to", "CS"),
            "notes": a.get("notes", ""),
        })
    return result


def create_fe_activity(payload: dict) -> dict:
    """Create a new activity log entry."""
    data = _load_data()
    log = data.setdefault("activity_log", [])
    next_id = max((a["id"] for a in log), default=0) + 1
    now = _now_stamp()

    new_entry = {
        "id": next_id,
        "timestamp": now,
        "actor_role": payload.get("actor_role", "CS"),
        "actor_id": payload.get("actor_id", 1),
        "action": payload.get("action", ""),
        "ref_type": payload.get("ref_type", "inquiry"),
        "ref_id": payload.get("ref_id", ""),
        "customer_name": payload.get("customer_name", ""),
        "pushed_to": payload.get("pushed_to", "CS"),
        "notes": payload.get("notes", ""),
    }
    log.insert(0, new_entry)
    _save_data(data)

    return {
        "id": f"ACT-{next_id:03d}",
        "timestamp": now,
        "actor_role": new_entry["actor_role"],
        "actor_id": new_entry["actor_id"],
        "action": new_entry["action"],
        "ref_type": new_entry["ref_type"],
        "ref_id": new_entry["ref_id"],
        "customer_name": new_entry["customer_name"],
        "pushed_to": new_entry["pushed_to"],
        "notes": new_entry["notes"],
    }


# ---------------------------------------------------------------------------
# Rate Search
# ---------------------------------------------------------------------------

def search_fe_rates(
    origin: str | None = None,
    destination: str | None = None,
    container_type: str | None = None,
    liner_name: str | None = None,
    rate_type: str | None = None,
) -> list[dict]:
    """Search rates table and return frontend-shaped results."""
    from .queries import search_rates
    results = search_rates(
        origin=origin, destination=destination,
        container_type=container_type, liner_name=liner_name,
        rate_type=rate_type,
    )
    return [{
        "id": r["id"],
        "liner_name": r.get("liner_name", ""),
        "origin": r.get("origin", ""),
        "destination": r.get("destination", ""),
        "container_type": r.get("container_type", ""),
        "rate_type": r.get("rate_type", ""),
        "amount": r.get("amount", 0),
        "currency": r.get("currency", "USD"),
        "valid_from": r.get("valid_from", ""),
        "valid_to": r.get("valid_to", ""),
        "source_system": r.get("source_system", ""),
    } for r in results]


# ---------------------------------------------------------------------------
# InttraAPI Simulation
# ---------------------------------------------------------------------------

def simulate_inttra_spot_rates(
    origin: str | None = None,
    destination: str | None = None,
    container_type: str | None = None,
) -> list[dict]:
    """
    Simulate an InttraAPI spot rate lookup.
    Returns 2-4 mock spot rate offers with realistic freight data.
    Uses a hash of the route as seed so results are deterministic per route.
    """
    import hashlib
    from datetime import timedelta

    seed = hashlib.md5(f"{origin or ''}{destination or ''}".encode()).hexdigest()
    seed_int = int(seed[:8], 16)

    liners = [
        ("Maersk Line", "MAEU"),
        ("MSC", "MSCU"),
        ("CMA CGM", "CMDU"),
        ("Hapag-Lloyd", "HLCU"),
        ("ONE", "ONEY"),
        ("Evergreen", "EGLV"),
        ("COSCO Shipping", "COSU"),
    ]

    ct = container_type or "20'GP"
    base_rate = 800 + (seed_int % 1200)

    results = []
    num_results = 2 + (seed_int % 3)  # 2-4 results

    for i in range(num_results):
        liner_idx = (seed_int + i * 3) % len(liners)
        liner_name, liner_code = liners[liner_idx]
        variance = -150 + (seed_int + i * 7) % 400
        amount = base_rate + variance

        transit = 7 + (seed_int + i * 5) % 21
        now = datetime.now()
        valid_from = now.strftime("%Y-%m-%d")
        valid_to = (now + timedelta(days=3 + i)).strftime("%Y-%m-%d")
        booking_cutoff = (now + timedelta(days=1 + i)).strftime("%Y-%m-%d")

        results.append({
            "id": i + 1,
            "liner_name": liner_name,
            "liner_code": liner_code,
            "origin": origin or "N/A",
            "destination": destination or "N/A",
            "container_type": ct,
            "rate_type": "Spot",
            "amount": amount,
            "currency": "USD",
            "transit_days": transit,
            "valid_from": valid_from,
            "valid_to": valid_to,
            "booking_cutoff": booking_cutoff,
            "source": "InttraAPI",
            "free_time_days": 7 + (seed_int + i) % 7,
        })

    return results


def simulate_inttra_booking(
    booking_id: str = "",
    shipping_line: str = "",
    origin: str = "",
    destination: str = "",
    container_type: str = "20'GP",
    quantity: int = 1,
) -> dict:
    """
    Simulate an InttraAPI booking request.
    Returns a mock booking confirmation with vessel, voyage, and reference numbers.
    Uses deterministic hashing so the same inputs always produce the same result.
    """
    import hashlib

    seed = hashlib.md5(f"{booking_id}{shipping_line}{origin}{destination}".encode()).hexdigest()
    seed_int = int(seed[:8], 16)

    vessels = [
        "Maersk Seletar", "MSC Gulsun", "CMA CGM Marco Polo", "Ever Ace",
        "COSCO Universe", "ONE Commitment", "Hapag Colombo Express",
        "Madrid Maersk", "MSC Isabella", "CMA CGM Palais Royal",
    ]
    vessel = vessels[seed_int % len(vessels)]
    voyage = f"VOY-{2026}-{(seed_int % 900) + 100}"
    booking_ref = f"INTR-{seed[:8].upper()}"

    now = datetime.now()
    from datetime import timedelta
    etd = now + timedelta(days=3 + seed_int % 10)
    eta = etd + timedelta(days=7 + seed_int % 21)

    return {
        "success": True,
        "booking_reference": booking_ref,
        "vessel_name": vessel,
        "voyage_number": voyage,
        "shipping_line": shipping_line or "Maersk Line",
        "origin": origin,
        "destination": destination,
        "container_type": container_type,
        "quantity": quantity,
        "etd": etd.strftime("%Y-%m-%d"),
        "eta": eta.strftime("%Y-%m-%d"),
        "status": "Confirmed",
        "message": f"Booking confirmed with {shipping_line or 'carrier'}. Vessel {vessel}, Voyage {voyage}. ETD {etd.strftime('%Y-%m-%d')}, ETA {eta.strftime('%Y-%m-%d')}.",
    }
