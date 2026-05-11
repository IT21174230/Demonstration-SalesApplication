"""
One-time script to enrich mock_data.json with frontend-specific fields.
Adds: customer fields (tier, payment_terms, location, etc.),
      inquiry fields (inquiry_text, request, sbu),
      shipments table, fe_quotes table.
"""
import json
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parent / "Data" / "mock_data.json"

with open(DATA_FILE, "r", encoding="utf-8") as f:
    data = json.load(f)

# ──────────────────────────────────────────────────────────────────────
# 1a. Enrich customers with frontend fields
# ──────────────────────────────────────────────────────────────────────
CUSTOMER_ENRICHMENTS = {
    7:  {"tier": "Key Account", "payment_terms": "30-Day Credit", "location": "Colombo, Sri Lanka",    "blacklisted": False, "credit_hold": False, "min_margin_pct": 5},
    8:  {"tier": "Key Account", "payment_terms": "30-Day Credit", "location": "Colombo, Sri Lanka",    "blacklisted": False, "credit_hold": False, "min_margin_pct": 5},
    9:  {"tier": "Regular",     "payment_terms": "Pay Upfront",   "location": "Colombo, Sri Lanka",    "blacklisted": False, "credit_hold": False, "min_margin_pct": 7},
    10: {"tier": "Key Account", "payment_terms": "60-Day Credit", "location": "Colombo, Sri Lanka",    "blacklisted": False, "credit_hold": False, "min_margin_pct": 4, "notes": "Strategic account — large monthly volume"},
    11: {"tier": "Key Account", "payment_terms": "30-Day Credit", "location": "Peliyagoda, Sri Lanka", "blacklisted": False, "credit_hold": True,  "min_margin_pct": 5, "notes": "Credit hold — finance to clear before next quote"},
    12: {"tier": "Regular",     "payment_terms": "Pay Upfront",   "location": "Katunayake, Sri Lanka", "blacklisted": False, "credit_hold": False, "min_margin_pct": 7},
}

# Also add defaults for customers 1-6 (backend-original customers) so the
# transform layer can always find these fields.
CUSTOMER_DEFAULTS = {
    1:  {"tier": "Regular",     "payment_terms": "Pay Upfront",   "location": "Colombo, Sri Lanka",   "blacklisted": False, "credit_hold": False, "min_margin_pct": 7},
    2:  {"tier": "Key Account", "payment_terms": "30-Day Credit", "location": "Colombo, Sri Lanka",   "blacklisted": False, "credit_hold": False, "min_margin_pct": 5},
    3:  {"tier": "Regular",     "payment_terms": "Pay Upfront",   "location": "Mumbai, India",        "blacklisted": False, "credit_hold": False, "min_margin_pct": 7},
    4:  {"tier": "Walk-in",     "payment_terms": "Pay Upfront",   "location": "Colombo, Sri Lanka",   "blacklisted": False, "credit_hold": False, "min_margin_pct": 10},
    5:  {"tier": "Walk-in",     "payment_terms": "Pay Upfront",   "location": "Colombo, Sri Lanka",   "blacklisted": False, "credit_hold": False, "min_margin_pct": 10},
    6:  {"tier": "Walk-in",     "payment_terms": "Pay Upfront",   "location": "Colombo, Sri Lanka",   "blacklisted": False, "credit_hold": False, "min_margin_pct": 10},
}

all_enrichments = {**CUSTOMER_DEFAULTS, **CUSTOMER_ENRICHMENTS}

for cust in data["customers"]:
    cid = cust["id"]
    if cid in all_enrichments:
        for k, v in all_enrichments[cid].items():
            if k not in cust:
                cust[k] = v

# Ensure any customer without frontend fields gets Walk-in defaults.
WALK_IN_DEFAULTS = {"tier": "Walk-in", "payment_terms": "Pay Upfront", "location": "Colombo, Sri Lanka", "blacklisted": False, "credit_hold": False, "min_margin_pct": 10}
for cust in data["customers"]:
    for k, v in WALK_IN_DEFAULTS.items():
        if k not in cust:
            cust[k] = v

# Add Vanguard Shippers if not present (by name, not ID — IDs may have shifted)
if not any(c["name"] == "Vanguard Shippers" for c in data["customers"]):
    next_id = max(c["id"] for c in data["customers"]) + 1
    data["customers"].append({
        "id": next_id,
        "name": "Vanguard Shippers",
        "customer_type": "new",
        "contact_email": "ops@vanguardshippers.pk",
        "contact_phone": "+92213456789",
        "kyc_status": "not_started",
        "kyc_completed_at": None,
        "created_at": "2026-03-15T09:00:00Z",
        "tier": "Walk-in",
        "payment_terms": "Pay Upfront",
        "location": "Karachi, Pakistan",
        "blacklisted": True,
        "credit_hold": False,
        "min_margin_pct": 10,
        "notes": "Blacklisted -- repeated payment defaults in 2025",
    })

# ──────────────────────────────────────────────────────────────────────
# 1b. Enrich frontend inquiries with inquiry_text, request, sbu
# ──────────────────────────────────────────────────────────────────────
INQUIRY_ENRICHMENTS = {
    5013: {
        "fe_id": "INQ-1041",
        "inquiry_text": "Hi, we need 12 reefer containers from Colombo to Hamburg by next Friday.",
        "request": "12 reefer containers",
        "sbu": "Ocean Exports",
    },
    5014: {
        "fe_id": "INQ-1040",
        "inquiry_text": "Need quote for 4x40ft to Singapore, ETD this week.",
        "request": "4x 40ft containers",
        "sbu": "Ocean Exports",
    },
    5015: {
        "fe_id": "INQ-1039",
        "inquiry_text": "Customer ABC requested 10 containers from Chennai to Colombo.",
        "request": "10 containers",
        "sbu": "Ocean Imports",
    },
    5016: {
        "fe_id": "INQ-1038",
        "inquiry_text": "Looking for 6 dry containers to Rotterdam, please advise rate.",
        "request": "6 dry containers",
        "sbu": "Ocean Exports",
    },
    5017: {
        "fe_id": "INQ-1037",
        "inquiry_text": "Please confirm space for 8 containers to Dubai sailing on the 10th.",
        "request": "8 containers",
        "sbu": "Ocean Exports",
    },
    5018: {
        "fe_id": "INQ-1036",
        "inquiry_text": "Need 3x20ft to Mumbai urgent.",
        "request": "3x 20ft containers",
        "sbu": "Ocean Exports",
    },
}

for inq in data["inquiries"]:
    iid = inq["id"]
    if iid in INQUIRY_ENRICHMENTS:
        for k, v in INQUIRY_ENRICHMENTS[iid].items():
            inq[k] = v

# ──────────────────────────────────────────────────────────────────────
# 1c. Add shipments table
# ──────────────────────────────────────────────────────────────────────
data["shipments"] = [
    {
        "id": "SHP-801",
        "quote_id": "QUO-501",
        "customer_id": 9,
        "origin": "Chennai",
        "destination": "Colombo",
        "shipping_line": "Hapag-Lloyd",
        "status": "In Transit",
        "booked_at": "2026-05-02 09:00",
        "expected_delivery": "2026-05-05",
        "pod_received": None,
        "legs": [
            {"id": "SL-1", "port": "Chennai",  "type": "Origin",      "expected_at": "2026-05-02", "actual_at": "2026-05-02", "status": "Departed"},
            {"id": "SL-2", "port": "Colombo",  "type": "Destination", "expected_at": "2026-05-05", "actual_at": None,         "status": "Pending"},
        ],
    },
    {
        "id": "SHP-800",
        "quote_id": "QUO-500",
        "customer_id": 10,
        "origin": "Colombo",
        "destination": "Rotterdam",
        "shipping_line": "Maersk",
        "status": "At Transshipment",
        "booked_at": "2026-05-02 08:00",
        "expected_delivery": "2026-05-26",
        "pod_received": None,
        "legs": [
            {"id": "SL-3", "port": "Colombo",   "type": "Origin",        "expected_at": "2026-05-02", "actual_at": "2026-05-02", "status": "Departed"},
            {"id": "SL-4", "port": "Singapore", "type": "Transshipment", "expected_at": "2026-05-08", "actual_at": "2026-05-09", "status": "Arrived"},
            {"id": "SL-5", "port": "Rotterdam", "type": "Destination",   "expected_at": "2026-05-26", "actual_at": None,         "status": "Pending"},
        ],
    },
]

# ──────────────────────────────────────────────────────────────────────
# 1d. Add fe_quotes table (frontend-shaped quotes with lines[])
# ──────────────────────────────────────────────────────────────────────
data["fe_quotes"] = [
    {
        "id": "QUO-501",
        "inquiry_id": "INQ-1039",
        "customer_id": 9,
        "origin": "Chennai",
        "destination": "Colombo",
        "quote_type": "FCA",
        "margin_pct": 8,
        "status": "Confirmed",
        "created_at": "2026-05-01 15:40",
        "created_by": 1,
        "approver_id": None,
        "approval_reason": None,
        "lines": [
            {"id": "QL-1", "shipping_line": "Hapag-Lloyd", "rate_type": "Contractual", "base_rate_usd": 850,  "transit_days": 3, "free_time_days": 14, "transshipment_points": "Direct",     "destination_charges_usd": 120},
            {"id": "QL-2", "shipping_line": "CMA CGM",     "rate_type": "Spot",        "base_rate_usd": 920,  "transit_days": 4, "free_time_days": 10, "transshipment_points": "Direct",     "destination_charges_usd": 110},
            {"id": "QL-3", "shipping_line": "ONE",         "rate_type": "NAC",         "base_rate_usd": 870,  "transit_days": 3, "free_time_days": 21, "transshipment_points": "Direct",     "destination_charges_usd": 130},
        ],
    },
    {
        "id": "QUO-500",
        "inquiry_id": "INQ-1038",
        "customer_id": 10,
        "origin": "Colombo",
        "destination": "Rotterdam",
        "quote_type": "DDP",
        "margin_pct": 4,
        "status": "Confirmed",
        "created_at": "2026-05-01 14:00",
        "created_by": 3,
        "approver_id": None,
        "approval_reason": None,
        "lines": [
            {"id": "QL-4", "shipping_line": "Maersk", "rate_type": "Contractual", "base_rate_usd": 2400, "transit_days": 24, "free_time_days": 14, "transshipment_points": "Singapore", "destination_charges_usd": 220},
            {"id": "QL-5", "shipping_line": "MSC",    "rate_type": "Contractual", "base_rate_usd": 2350, "transit_days": 26, "free_time_days": 14, "transshipment_points": "Jebel Ali",  "destination_charges_usd": 240},
        ],
    },
]

# ──────────────────────────────────────────────────────────────────────
# Save
# ──────────────────────────────────────────────────────────────────────
with open(DATA_FILE, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("mock_data.json enriched successfully")
print(f"  Customers: {len(data['customers'])} (enriched with tier/location/etc.)")
print(f"  Inquiries enriched: {len(INQUIRY_ENRICHMENTS)} (with inquiry_text, request, sbu)")
print(f"  Shipments added: {len(data['shipments'])}")
print(f"  FE Quotes added: {len(data['fe_quotes'])}")
