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
            "channel": _map_channel(i.get("channel", "email")),
            "sbu": i.get("sbu", "Ocean Exports"),
            "employee_id": i.get("received_by_party_id", 1),
            "status": fe_status,
            "created_at": created_at,
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

    new_inq = {
        "id": next_id,
        "customer_id": customer_id,
        "channel": payload.get("channel", "email").lower(),
        "origin": payload.get("origin", "TBD"),
        "destination": payload.get("destination", "TBD"),
        "commodity": payload.get("request", ""),
        "container_type": "N/A",
        "quantity": 1,
        "status": "new",
        "received_at": now,
        "received_by_party_id": payload.get("employee_id", 1),
        "inquiry_text": payload.get("inquiry_text", ""),
        "request": payload.get("request", ""),
        "sbu": payload.get("sbu", "Ocean Exports"),
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
        "channel": _map_channel(new_inq["channel"]),
        "sbu": new_inq["sbu"],
        "employee_id": new_inq["received_by_party_id"],
        "status": "pending",
        "created_at": _now_stamp(),
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
    allowed = {"tier", "payment_terms", "location", "blacklisted", "credit_hold", "min_margin_pct", "notes"}
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
