"""
Generates Context/Inquiry_API_Discrepancy_Report.pdf
Run once, then delete this script if desired.
All strings use ASCII-only to avoid latin-1 encoding issues with core fonts.
"""
from fpdf import FPDF
from fpdf.enums import XPos, YPos

NAVY  = (44, 44, 130)
TEAL  = (15, 143, 168)
WHITE = (255, 255, 255)
LIGHT = (245, 247, 250)
DARK  = (30, 30, 50)
GREY  = (110, 120, 140)
GREEN = (20, 130, 80)
AMBER = (170, 110, 10)
RED   = (180, 30, 30)

OUT = r"D:\Neuball\SalesTrackingSystem\MVP-Demo\Context\Inquiry_API_Discrepancy_Report.pdf"


class PDF(FPDF):
    def header(self):
        self.set_fill_color(*NAVY)
        self.rect(0, 0, 210, 16, "F")
        self.set_text_color(*WHITE)
        self.set_font("Helvetica", "B", 11)
        self.set_xy(10, 3)
        self.cell(0, 10, "CLSynergy  |  Inquiry Module - Frontend / Backend Discrepancy Report",
                  new_x=XPos.RIGHT, new_y=YPos.TOP)
        self.set_text_color(*DARK)

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*GREY)
        self.cell(0, 6, f"Page {self.page_no()}  |  CLSynergy MVP - Integration Notes", align="C")
        self.set_text_color(*DARK)


def section_title(pdf, text):
    pdf.ln(5)
    pdf.set_fill_color(*TEAL)
    pdf.set_text_color(*WHITE)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(0, 8, f"  {text}", new_x=XPos.LMARGIN, new_y=YPos.NEXT, fill=True)
    pdf.set_text_color(*DARK)
    pdf.ln(2)


def sub_title(pdf, text):
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 6, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(*DARK)
    pdf.ln(1)


def th(pdf, cols):
    pdf.set_fill_color(*NAVY)
    pdf.set_text_color(*WHITE)
    pdf.set_font("Helvetica", "B", 8)
    for label, w in cols:
        pdf.cell(w, 7, f"  {label}", fill=True)
    pdf.ln()
    pdf.set_text_color(*DARK)


def tr(pdf, cells, cols, shade=False):
    pdf.set_fill_color(*(LIGHT if shade else WHITE))
    pdf.set_font("Helvetica", "", 8)
    heights = []
    for text, (_, w) in zip(cells, cols):
        lines = pdf.multi_cell(w - 2, 4.5, text, dry_run=True, output="LINES")
        heights.append(max(len(lines), 1))
    row_h = max(heights) * 4.5 + 2
    x0 = pdf.get_x()
    y0 = pdf.get_y()
    for text, (_, w) in zip(cells, cols):
        pdf.set_xy(x0, y0)
        pdf.multi_cell(w, 4.5, f"  {text}", fill=shade,
                       max_line_height=4.5, new_x=XPos.RIGHT, new_y=YPos.TOP)
        x0 += w
    pdf.set_y(y0 + row_h)


def bullet(pdf, text, color=DARK):
    pdf.set_font("Helvetica", "", 8.5)
    pdf.set_text_color(*color)
    pdf.set_x(14)
    pdf.cell(4, 5, "-")
    pdf.multi_cell(0, 5, text)
    pdf.set_text_color(*DARK)


# ── Build PDF ─────────────────────────────────────────────────────────────────

pdf = PDF(orientation="P", unit="mm", format="A4")
pdf.set_auto_page_break(auto=True, margin=16)
pdf.set_margins(10, 20, 10)
pdf.add_page()

# Cover block
pdf.set_font("Helvetica", "B", 16)
pdf.set_text_color(*NAVY)
pdf.ln(4)
pdf.cell(0, 10, "Inquiry Module", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="C")
pdf.set_font("Helvetica", "", 11)
pdf.set_text_color(*TEAL)
pdf.cell(0, 7, "Frontend  <->  Backend Discrepancy Report", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="C")
pdf.set_font("Helvetica", "", 8)
pdf.set_text_color(*GREY)
pdf.cell(0, 5, "CLSynergy MVP  |  Integration Branch  |  July 2026", new_x=XPos.LMARGIN, new_y=YPos.NEXT, align="C")
pdf.set_text_color(*DARK)
pdf.ln(4)

# ── 1. What was wired ────────────────────────────────────────────────────────
section_title(pdf, "1.  What Was Wired")

sub_title(pdf, "POST  /inquiries/inquiries-new-new  --  Create Inquiry")
pdf.set_font("Helvetica", "", 8.5)
pdf.multi_cell(0, 5,
    "apiCreateInquiry() transforms the flat frontend payload into the backend nested structure "
    "{ client, contact, inquiry, commodities[], containers[] } and calls the correct URL. "
    "Each ContainerLine maps to one CommodityNew + one ContainerNew, linked by commodity_index. "
    "ContainerLine.isFcl maps to ContainerNew.is_fully_loaded per backend convention.")
pdf.ln(3)

MC = [("Frontend Field", 72), ("-> Backend Field", 118)]
th(pdf, MC)
for i, (f, b) in enumerate([
    ("customer_name",                              "client.name"),
    ("contact_person",                             "contact.name"),
    ("contact_channel_id  (channel = Email)",      "contact.email"),
    ("contact_channel_id  (channel = WhatsApp)",   "contact.whatsapp"),
    ("sbu, origin, priority, remark",              "inquiry.*  (same field names)"),
    ("delivery_type  'port-to-port'",              "inquiry.service_mode = PORT_TO_PORT"),
    ("delivery_type  'door-to-door'",              "inquiry.service_mode = DOOR_TO_DOOR"),
    ("preferred_liners: string[]",                 "inquiry.preferred_liners (joined as comma string)"),
    ("ContainerLine  (each item)",                 "commodities[i]  +  containers[i]  with commodity_index: i"),
    ("ContainerLine.isFcl",                        "containers[i].is_fully_loaded"),
]):
    tr(pdf, [f, b], MC, shade=(i % 2 == 0))

pdf.ln(3)
pdf.set_font("Helvetica", "I", 8)
pdf.set_text_color(*GREY)
pdf.multi_cell(0, 4.5,
    "Response { inq_id, cli_id, cpid, com_ids, cont_ids } replaces the optimistic entry in-place. "
    "Frontend id is set to String(inq_id); all five backend IDs are stored on the Inquiry object.")
pdf.set_text_color(*DARK)
pdf.ln(3)

sub_title(pdf, "GET  /inquiries/inquiries/{inq_id}  --  Fetch Single Inquiry")
pdf.set_font("Helvetica", "", 8.5)
pdf.multi_cell(0, 5,
    "apiFetchInquiry(inq_id: number) returns InquiryRow[] -- one row per commodity-container join. "
    "InquiryRow typed in api.ts covers: inq_id, emp_id, sbu, origin, incoterm, priority, "
    "service_mode, cargo_ready_date, preferred_liners, preferred_rate, com_id, commodity_name, "
    "commodity_type, hs_code, commodity_weight, cont_id, container_type, temperature, qty, "
    "destination, zip_code, address, is_fully_loaded, free_time.")
pdf.ln(3)

sub_title(pdf, "PATCH  /inquiries/inquiries/{inq_id}  --  Patch Inquiry Fields")
pdf.set_font("Helvetica", "", 8.5)
pdf.multi_cell(0, 5,
    "apiPatchInquiry(inq_id, data) accepts: sbu, remark, origin, incoterm, cargo_ready_date, "
    "priority, preferred_liners, preferred_rate, service_mode. "
    "Only fields present in the payload are updated (exclude_unset on the backend).")
pdf.ln(3)

sub_title(pdf, "PATCH  .../commodities/{com_id}  and  .../containers/{cont_id}")
pdf.set_font("Helvetica", "", 8.5)
pdf.multi_cell(0, 5,
    "apiPatchCommodity(inq_id, com_id, data) and apiPatchContainer(inq_id, cont_id, data) "
    "cover the two remaining PATCH routes in the inquiry router.")
pdf.ln(3)

sub_title(pdf, "mockData.ts Additions")
bullet(pdf, "Inquiry -- new optional backend fields (populated after create / fetch):")
for f in ["inq_id: number", "cli_id: number", "cpid: number",
          "com_ids: number[]", "cont_ids: number[]",
          "incoterm: string", "cargo_ready_date: string", "preferred_rate: number"]:
    pdf.set_x(20)
    pdf.set_font("Courier", "", 8)
    pdf.cell(0, 4.5, f, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
pdf.ln(2)
bullet(pdf, "ContainerLine -- new optional backend fields:")
for f in ["temperature: number   // reefer set-point in deg C",
          "address: string       // door-delivery address (distinct from zip code)"]:
    pdf.set_x(20)
    pdf.set_font("Courier", "", 8)
    pdf.cell(0, 4.5, f, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
pdf.ln(4)

# ── 2. Frontend -> Backend discrepancies ─────────────────────────────────────
section_title(pdf, "2.  Discrepancies -- Frontend Has,  Backend Lacks  (backend not modified)")

DC = [("Frontend Field / Concept", 60), ("Issue", 130)]
th(pdf, DC)
for i, (f, issue) in enumerate([
    ("inquiry_text / request",
     "No column in the inquiry table. Free-text description is not persisted to the backend."),
    ("destination  (inquiry-level)",
     "Backend stores destination per container only, not at inquiry level."),
    ("channel  ('WhatsApp' | 'Email' | 'Phone')",
     "No inquiry-table column. Channel value (contact_channel_id) is routed to contact.email "
     "or contact.whatsapp; the channel label itself is lost."),
    ("status  ('pending' | 'completed')",
     "Not a backend field. Managed entirely in frontend state."),
    ("workflow_stage",
     "Not a backend field. The entire workflow state machine lives only in the frontend."),
    ("is_fcl (Inquiry)  /  isFcl (ContainerLine)",
     "Mapped to is_fully_loaded per backend convention. Semantically different: "
     "FCL/LCL vs whether the container is physically fully loaded."),
    ("ContainerLine.doorAgents[]",
     "No backend equivalent. Silently dropped on create."),
    ("ContainerLine.freeTime: number",
     "Backend free_time is a string. Sent as String(freeTime); semantic differences possible."),
    ("employee_id in create payload",
     "Backend derives emp_id from the auth session. This field is silently ignored."),
    ("contact_channel_id  when channel = 'Phone'",
     "Contact table has email and whatsapp but no phone field. "
     "Phone-channel inquiries have nowhere to store the contact number."),
    ("recorded_by",
     "Not in any backend payload or response."),
    ("completed_at  /  followup_note",
     "Not in any backend model."),
]):
    tr(pdf, [f, issue], DC, shade=(i % 2 == 0))
pdf.ln(4)

# ── 3. Backend -> Frontend discrepancies ─────────────────────────────────────
section_title(pdf, "3.  Discrepancies -- Backend Has / Lacks,  Frontend App Flow Lacks / Has")

BC = [("Item", 68), ("Detail", 122)]
th(pdf, BC)
for i, (item, detail) in enumerate([
    ("No 'fetch all inquiries' endpoint",
     "Router only has GET /inquiries/inquiries/{inq_id} (single record). "
     "The Inquiry List page cannot be populated until a list/paginate endpoint is added."),
    ("No DELETE endpoint",
     "No DELETE route in the inquiry router. Delete is frontend-only state."),
    ("apiAdvanceWorkflow -- no backend route",
     "Kept in api.ts so App.tsx compiles, but every call returns 404 "
     "until /workflow-stage is added to the router."),
    ("incoterm, cargo_ready_date, preferred_rate",
     "Backend stores these in the inquiry table. No UI controls in the "
     "New Inquiry form yet to capture them at creation time."),
    ("hs_code  (commodity)",
     "Returned by GET /inquiries/inquiries/{inq_id}. No form field to enter "
     "or display it on the frontend."),
    ("Existing client / existing contact paths",
     "POST /inquiries/inquiries-old-new and ...-old-old are not wired. "
     "All creates go through the new-client path -- duplicate clients will be "
     "created for returning customers. Requires cli_id lookup; no client-search "
     "endpoint available in the inquiry module."),
    ("temperature  (ContainerLine)",
     "Backend ContainerNew has temperature: int for reefer containers. "
     "Added to ContainerLine type in mockData.ts but no UI input field exists yet."),
    ("address  (ContainerLine)",
     "Backend ContainerNew has address: str for door-delivery. "
     "Added to ContainerLine type but no UI input field exists yet."),
]):
    tr(pdf, [item, detail], BC, shade=(i % 2 == 0))
pdf.ln(4)

# ── 4. ContainerLine mapping reference ───────────────────────────────────────
section_title(pdf, "4.  Full Field Mapping Reference -- ContainerLine -> Backend")

FC = [("ContainerLine Field", 52), ("Backend Table", 38), ("Backend Column", 50), ("Notes", 50)]
th(pdf, FC)
for i, row in enumerate([
    ("containerType",  "container", "container_type",  "Direct string"),
    ("quantity",       "container", "qty",             "Direct int"),
    ("weight",         "commodity", "weight",          "Float; '' becomes None"),
    ("commodityType",  "commodity", "com_type",        "Direct string"),
    ("commodityName",  "commodity", "name",            "Direct string"),
    ("destination",    "container", "destination",     "Required; falls back to inquiry-level destination"),
    ("isFcl",          "container", "is_fully_loaded", "bool; mapped per backend convention"),
    ("zipCode",        "container", "zip_code",        "'' becomes None"),
    ("freeTime",       "container", "free_time",       "number -> String(n); '' becomes None"),
    ("temperature",    "container", "temperature",     "New field; no UI input yet"),
    ("address",        "container", "address",         "New field; no UI input yet"),
    ("doorAgents[]",   "--",        "--",              "NO BACKEND EQUIVALENT - dropped"),
]):
    tr(pdf, list(row), FC, shade=(i % 2 == 0))
pdf.ln(4)

# ── 5. Endpoint status ────────────────────────────────────────────────────────
section_title(pdf, "5.  Inquiry Endpoint Status at a Glance")

EC = [("Method", 22), ("Path", 90), ("Frontend Function", 52), ("Status", 26)]
th(pdf, EC)
STATUS_COLORS = {
    "WIRED":         GREEN,
    "NOT WIRED":     AMBER,
    "MISSING IN BE": RED,
}
for i, (method, path, fn, status) in enumerate([
    ("POST",   "/inquiries/inquiries-new-new",                       "apiCreateInquiry()",    "WIRED"),
    ("POST",   "/inquiries/inquiries-old-new",                       "--",                    "NOT WIRED"),
    ("POST",   "/inquiries/inquiries-old-old",                       "--",                    "NOT WIRED"),
    ("GET",    "/inquiries/inquiries/{inq_id}",                      "apiFetchInquiry()",     "WIRED"),
    ("PATCH",  "/inquiries/inquiries/{inq_id}",                      "apiPatchInquiry()",     "WIRED"),
    ("PATCH",  "/inquiries/inquiries/{inq_id}/commodities/{com_id}", "apiPatchCommodity()",   "WIRED"),
    ("PATCH",  "/inquiries/inquiries/{inq_id}/containers/{cont_id}", "apiPatchContainer()",   "WIRED"),
    ("GET",    "/inquiries/inquiries  (list / paginate)",            "--",                    "MISSING IN BE"),
    ("DELETE", "/inquiries/inquiries/{inq_id}",                      "--",                    "MISSING IN BE"),
    ("PATCH",  "/inquiries/{id}/workflow-stage",                     "apiAdvanceWorkflow()",  "MISSING IN BE"),
]):
    shade = (i % 2 == 0)
    pdf.set_fill_color(*(LIGHT if shade else WHITE))
    pdf.set_font("Helvetica", "", 8)
    y0 = pdf.get_y()
    x0 = pdf.get_x()
    for text, (_, w) in zip([method, path, fn], EC[:3]):
        pdf.set_xy(x0, y0)
        pdf.cell(w, 6, f"  {text}", fill=shade)
        x0 += w
    sc = STATUS_COLORS.get(status, DARK)
    pdf.set_text_color(*sc)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_xy(x0, y0)
    pdf.cell(EC[3][1], 6, f"  {status}", fill=shade, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_text_color(*DARK)

pdf.ln(6)

# Footer note
pdf.set_fill_color(240, 243, 248)
pdf.set_font("Helvetica", "I", 7.5)
pdf.set_text_color(*GREY)
pdf.multi_cell(0, 4.5,
    "Note: 'NOT WIRED' means the backend endpoint exists but the frontend does not call it yet. "
    "'MISSING IN BE' means the frontend expects the endpoint but it has not been implemented in the "
    "backend router. All changes described here are frontend-only; the backend repository (FreightOS) "
    "was not modified for these discrepancy resolutions.",
    fill=True)

pdf.output(OUT)
print(f"Written: {OUT}")
