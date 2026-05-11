import json
from datetime import datetime, timezone
from Utils.DB_Query.queries import (
    get_all,
    get_by_id,
    create,
    update,
    delete,
    search_customers,
    search_inquiries,
    search_rates,
    search_process_instances,
    search_quotations,
    search_rate_requests,
    get_step_executions_for_instance,
    get_state_history_for_execution,
)


def handle_tool_call(name: str, arguments: dict) -> str:
    result = _dispatch(name, arguments)
    return json.dumps(result, default=str)


def _dispatch(name: str, args: dict):
    now = datetime.now(timezone.utc).isoformat()

    # --- List / lookup tools ---
    if name == "get_all_records":
        return get_all(args["table_name"])

    if name == "get_record_by_id":
        record = get_by_id(args["table_name"], args["record_id"])
        return record if record else {"error": "Record not found"}

    # --- Search tools ---
    if name == "search_customers":
        return search_customers(**args)

    if name == "search_inquiries":
        return search_inquiries(**args)

    if name == "search_rates":
        return search_rates(**args)

    if name == "search_process_instances":
        return search_process_instances(**args)

    if name == "search_quotations":
        return search_quotations(**args)

    if name == "search_rate_requests":
        return search_rate_requests(**args)

    if name == "get_step_executions_for_instance":
        return get_step_executions_for_instance(**args)

    if name == "get_state_history_for_execution":
        return get_state_history_for_execution(**args)

    # --- Customer CRUD ---
    if name == "create_customer":
        record = {
            "name": args["name"],
            "customer_type": args["customer_type"],
            "contact_email": args["contact_email"],
            "contact_phone": args["contact_phone"],
            "kyc_status": "not_started",
            "kyc_completed_at": None,
            "created_at": now,
        }
        return create("customers", record)

    if name == "update_customer":
        customer_id = args.pop("customer_id")
        updates = {k: v for k, v in args.items() if v is not None}
        if updates.get("kyc_status") == "approved":
            updates["kyc_completed_at"] = now
        updated = update("customers", customer_id, updates)
        return updated if updated else {"error": "Customer not found"}

    # --- Inquiry CRUD ---
    if name == "create_inquiry":
        record = {
            "customer_id": args["customer_id"],
            "channel": args["channel"],
            "origin": args["origin"],
            "destination": args["destination"],
            "commodity": args["commodity"],
            "container_type": args["container_type"],
            "quantity": args["quantity"],
            "status": "new",
            "received_at": now,
            "received_by_party_id": 2,
        }
        return create("inquiries", record)

    if name == "update_inquiry_status":
        updated = update("inquiries", args["inquiry_id"], {"status": args["status"]})
        return updated if updated else {"error": "Inquiry not found"}

    # --- Process instance CRUD ---
    if name == "create_process_instance":
        first_step_id = 11 if args["main_process_id"] == 1 else 21
        record = {
            "main_process_id": args["main_process_id"],
            "customer_id": args["customer_id"],
            "reference_number": args["reference_number"],
            "current_step_id": first_step_id,
            "status": "active",
            "started_at": now,
            "completed_at": None,
        }
        return create("process_instances", record)

    if name == "update_process_instance_status":
        updates = {"status": args["status"]}
        if args["status"] == "completed":
            updates["completed_at"] = now
        updated = update("process_instances", args["process_instance_id"], updates)
        return updated if updated else {"error": "Process instance not found"}

    # --- Step execution CRUD ---
    if name == "create_step_execution":
        record = {
            "process_instance_id": args["process_instance_id"],
            "step_id": args["step_id"],
            "assigned_to_party_id": args["assigned_to_party_id"],
            "status": args["status"],
            "started_at": now if args["status"] == "in_progress" else None,
            "completed_at": None,
            "actual_tat_minutes": None,
            "notes": args.get("notes", ""),
        }
        return create("step_executions", record)

    if name == "update_step_execution":
        step_execution_id = args["step_execution_id"]
        updates = {}
        if "status" in args:
            updates["status"] = args["status"]
            if args["status"] == "completed":
                updates["completed_at"] = now
            elif args["status"] == "in_progress":
                updates["started_at"] = now
        if "notes" in args:
            updates["notes"] = args["notes"]
        updated = update("step_executions", step_execution_id, updates)
        return updated if updated else {"error": "Step execution not found"}

    # --- Rate CRUD ---
    if name == "create_rate":
        record = {
            "liner_name": args["liner_name"],
            "origin": args["origin"],
            "destination": args["destination"],
            "container_type": args["container_type"],
            "rate_type": args["rate_type"],
            "amount": args["amount"],
            "currency": args["currency"],
            "valid_from": args["valid_from"],
            "valid_to": args["valid_to"],
            "source_system": "AMS" if args["rate_type"] != "spot" else None,
            "last_updated": now,
        }
        return create("rates", record)

    # --- Rate request updates ---
    if name == "create_rate_request":
        record = {
            "process_instance_id": args["process_instance_id"],
            "inquiry_id": args["inquiry_id"],
            "requested_by_party_id": 2,   # CS
            "requested_from_party_id": 4,  # Procurement
            "channel": args["channel"],
            "requested_at": now,
            "responded_at": None,
            "resulting_rate_id": None,
            "status": "open",
        }
        return create("rate_requests", record)

    if name == "update_rate_request_status":
        updates = {"status": args["status"]}
        if args["status"] == "fulfilled":
            updates["responded_at"] = now
            if "resulting_rate_id" in args:
                updates["resulting_rate_id"] = args["resulting_rate_id"]
        elif args["status"] == "unavailable":
            updates["responded_at"] = now
        updated = update("rate_requests", args["rate_request_id"], updates)
        return updated if updated else {"error": "Rate request not found"}

    # --- Quotation CRUD ---
    if name == "create_quotation":
        rate = get_by_id("rates", args["rate_id"])
        base_amount = rate["amount"] if rate else 0
        markup_amount = round(base_amount * args["markup_percent"] / 100, 2)
        record = {
            "process_instance_id": args["process_instance_id"],
            "inquiry_id": args["inquiry_id"],
            "rate_id": args["rate_id"],
            "markup_percent": args["markup_percent"],
            "markup_amount": markup_amount,
            "quoted_amount": args["quoted_amount"],
            "currency": args["currency"],
            "option_label": args.get("option_label", "Option 1"),
            "channel": args["channel"],
            "quoted_by_party_id": 1,  # Sales
            "quoted_at": now,
            "status": "draft",
        }
        return create("quotations", record)

    if name == "update_quotation_status":
        updated = update("quotations", args["quotation_id"], {"status": args["status"]})
        return updated if updated else {"error": "Quotation not found"}

    # --- KYC ---
    if name == "send_kyc_form":
        customer = get_by_id("customers", args["customer_id"])
        if not customer:
            return {"error": "Customer not found"}
        message = args.get("message", "Please complete the attached KYC form and return it to us at your earliest convenience.")
        # Update KYC status to pending_customer
        update("customers", args["customer_id"], {"kyc_status": "pending_customer"})
        return {
            "success": True,
            "message": f"KYC form sent to {customer['name']} at {customer['contact_email']}",
            "details": {
                "customer_id": customer["id"],
                "customer_name": customer["name"],
                "email": customer["contact_email"],
                "kyc_status": "pending_customer",
                "sent_at": now,
                "email_body": message,
            }
        }

    # --- Delete ---
    if name == "delete_record":
        deleted = delete(args["table_name"], args["record_id"])
        if deleted:
            return {"success": True, "message": f"Deleted record {args['record_id']} from {args['table_name']}"}
        return {"error": "Record not found"}

    return {"error": f"Unknown tool: {name}"}
