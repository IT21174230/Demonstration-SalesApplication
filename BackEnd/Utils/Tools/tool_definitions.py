tools = [
    {
        "type": "function",
        "function": {
            "name": "get_all_records",
            "description": "Get all records from a table. Use this to list all customers, all inquiries, all rates, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "table_name": {
                        "type": "string",
                        "enum": [
                            "customers", "inquiries", "rates", "rate_requests",
                            "quotations", "process_instances", "step_executions",
                            "step_state_history", "main_processes", "process_steps",
                            "activity_types", "responsible_parties", "documents_systems",
                            "step_responsible_parties", "step_notified_parties", "step_documents"
                        ],
                        "description": "The table to retrieve all records from."
                    }
                },
                "required": ["table_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_customers",
            "description": "Search for customers by name, type, or KYC status. All parameters are optional filters.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Partial or full customer name (case-insensitive)."
                    },
                    "customer_type": {
                        "type": "string",
                        "enum": ["new", "existing"],
                        "description": "Filter by customer type."
                    },
                    "kyc_status": {
                        "type": "string",
                        "enum": ["not_started", "pending_customer", "pending_finance_approval", "approved", "rejected"],
                        "description": "Filter by KYC status."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_inquiries",
            "description": "Search for customer inquiries. Use this to find shipping inquiries by customer, route, status, or channel.",
            "parameters": {
                "type": "object",
                "properties": {
                    "customer_id": {
                        "type": "integer",
                        "description": "Filter by customer ID."
                    },
                    "origin": {
                        "type": "string",
                        "description": "Origin port or city (case-insensitive partial match)."
                    },
                    "destination": {
                        "type": "string",
                        "description": "Destination port or city (case-insensitive partial match)."
                    },
                    "status": {
                        "type": "string",
                        "enum": ["new", "verified", "in_pricing", "quoted", "dropped"],
                        "description": "Filter by inquiry status."
                    },
                    "channel": {
                        "type": "string",
                        "enum": ["whatsapp", "email", "phone", "in_person"],
                        "description": "Filter by communication channel."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_rates",
            "description": "Search for shipping rates in AMS. Use this to look up rates by route, container type, liner, or rate type.",
            "parameters": {
                "type": "object",
                "properties": {
                    "origin": {
                        "type": "string",
                        "description": "Origin port or city (case-insensitive partial match)."
                    },
                    "destination": {
                        "type": "string",
                        "description": "Destination port or city (case-insensitive partial match)."
                    },
                    "container_type": {
                        "type": "string",
                        "description": "Container type, e.g. 20'GP, 40'HC (case-insensitive partial match)."
                    },
                    "liner_name": {
                        "type": "string",
                        "description": "Shipping line name, e.g. MSC, Maersk (case-insensitive partial match)."
                    },
                    "rate_type": {
                        "type": "string",
                        "enum": ["contracted", "monthly", "spot"],
                        "description": "Filter by rate type."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_process_instances",
            "description": "Search for process instances (active workflows). Use this to check the status of quotation or pricing processes for a customer.",
            "parameters": {
                "type": "object",
                "properties": {
                    "customer_id": {
                        "type": "integer",
                        "description": "Filter by customer ID."
                    },
                    "status": {
                        "type": "string",
                        "enum": ["active", "completed", "cancelled", "blocked"],
                        "description": "Filter by process status."
                    },
                    "main_process_id": {
                        "type": "integer",
                        "description": "Filter by process type: 1 = Quotation, 2 = Rate Management & Pricing."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_quotations",
            "description": "Search for quotations sent to customers.",
            "parameters": {
                "type": "object",
                "properties": {
                    "process_instance_id": {
                        "type": "integer",
                        "description": "Filter by process instance ID."
                    },
                    "inquiry_id": {
                        "type": "integer",
                        "description": "Filter by inquiry ID."
                    },
                    "status": {
                        "type": "string",
                        "enum": ["draft", "sent", "accepted", "rejected", "expired"],
                        "description": "Filter by quotation status."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_rate_requests",
            "description": "Search for rate requests made from CS to Procurement when AMS has no rate.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["open", "fulfilled", "unavailable"],
                        "description": "Filter by request status."
                    },
                    "inquiry_id": {
                        "type": "integer",
                        "description": "Filter by inquiry ID."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_step_executions_for_instance",
            "description": "Get all step executions (audit trail) for a specific process instance. Shows what steps have been completed, are in progress, or are blocked.",
            "parameters": {
                "type": "object",
                "properties": {
                    "process_instance_id": {
                        "type": "integer",
                        "description": "The process instance ID to look up."
                    }
                },
                "required": ["process_instance_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_state_history_for_execution",
            "description": "Get the full state transition history for a specific step execution. Shows who changed the state and when.",
            "parameters": {
                "type": "object",
                "properties": {
                    "step_execution_id": {
                        "type": "integer",
                        "description": "The step execution ID to look up."
                    }
                },
                "required": ["step_execution_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_record_by_id",
            "description": "Get a single record by its ID from any table. Use this when you already know the exact ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "table_name": {
                        "type": "string",
                        "enum": [
                            "customers", "inquiries", "rates", "rate_requests",
                            "quotations", "process_instances", "step_executions",
                            "step_state_history", "main_processes", "process_steps",
                            "activity_types", "responsible_parties", "documents_systems"
                        ],
                        "description": "The table to look up."
                    },
                    "record_id": {
                        "type": "integer",
                        "description": "The record ID."
                    }
                },
                "required": ["table_name", "record_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_inquiry",
            "description": "Create a new customer inquiry. Use this when a customer sends a new shipping inquiry.",
            "parameters": {
                "type": "object",
                "properties": {
                    "customer_id": {
                        "type": "integer",
                        "description": "The customer ID."
                    },
                    "channel": {
                        "type": "string",
                        "enum": ["whatsapp", "email", "phone", "in_person"],
                        "description": "Channel the inquiry was received on."
                    },
                    "origin": {
                        "type": "string",
                        "description": "Origin port or city."
                    },
                    "destination": {
                        "type": "string",
                        "description": "Destination port or city."
                    },
                    "commodity": {
                        "type": "string",
                        "description": "Type of goods being shipped."
                    },
                    "container_type": {
                        "type": "string",
                        "description": "Container type, e.g. 20'GP, 40'HC."
                    },
                    "quantity": {
                        "type": "integer",
                        "description": "Number of containers."
                    }
                },
                "required": ["customer_id", "channel", "origin", "destination", "commodity", "container_type", "quantity"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_inquiry_status",
            "description": "Update the status of an existing inquiry.",
            "parameters": {
                "type": "object",
                "properties": {
                    "inquiry_id": {
                        "type": "integer",
                        "description": "The inquiry ID to update."
                    },
                    "status": {
                        "type": "string",
                        "enum": ["new", "verified", "in_pricing", "quoted", "dropped"],
                        "description": "The new status."
                    }
                },
                "required": ["inquiry_id", "status"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_process_instance_status",
            "description": "Update the status of a process instance (workflow).",
            "parameters": {
                "type": "object",
                "properties": {
                    "process_instance_id": {
                        "type": "integer",
                        "description": "The process instance ID to update."
                    },
                    "status": {
                        "type": "string",
                        "enum": ["active", "completed", "cancelled", "blocked"],
                        "description": "The new status."
                    }
                },
                "required": ["process_instance_id", "status"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_rate_request",
            "description": "Create a new rate request from CS to Procurement when AMS has no rate available.",
            "parameters": {
                "type": "object",
                "properties": {
                    "process_instance_id": {
                        "type": "integer",
                        "description": "The process instance this request belongs to."
                    },
                    "inquiry_id": {
                        "type": "integer",
                        "description": "The inquiry that triggered this rate request."
                    },
                    "channel": {
                        "type": "string",
                        "enum": ["whatsapp_group", "direct_call", "email"],
                        "description": "Channel used to request the rate."
                    }
                },
                "required": ["process_instance_id", "inquiry_id", "channel"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_quotation",
            "description": "Create a new quotation for a customer based on a rate and markup.",
            "parameters": {
                "type": "object",
                "properties": {
                    "process_instance_id": {
                        "type": "integer",
                        "description": "The process instance this quotation belongs to."
                    },
                    "inquiry_id": {
                        "type": "integer",
                        "description": "The inquiry this quotation responds to."
                    },
                    "rate_id": {
                        "type": "integer",
                        "description": "The underlying rate used for pricing."
                    },
                    "markup_percent": {
                        "type": "number",
                        "description": "Markup percentage applied."
                    },
                    "quoted_amount": {
                        "type": "number",
                        "description": "Final quoted amount."
                    },
                    "currency": {
                        "type": "string",
                        "description": "Currency code, e.g. USD."
                    },
                    "option_label": {
                        "type": "string",
                        "description": "Label like 'Option 1', 'Option 2'."
                    },
                    "channel": {
                        "type": "string",
                        "enum": ["email", "whatsapp"],
                        "description": "Channel to send the quotation."
                    }
                },
                "required": ["process_instance_id", "inquiry_id", "rate_id", "markup_percent", "quoted_amount", "currency", "channel"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_customer",
            "description": "Register a new customer in the system.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Customer company name."
                    },
                    "customer_type": {
                        "type": "string",
                        "enum": ["new", "existing"],
                        "description": "Whether this is a new or existing customer."
                    },
                    "contact_email": {
                        "type": "string",
                        "description": "Customer email address."
                    },
                    "contact_phone": {
                        "type": "string",
                        "description": "Customer phone number."
                    }
                },
                "required": ["name", "customer_type", "contact_email", "contact_phone"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_customer",
            "description": "Update a customer's details such as KYC status, contact info, or type.",
            "parameters": {
                "type": "object",
                "properties": {
                    "customer_id": {
                        "type": "integer",
                        "description": "The customer ID to update."
                    },
                    "name": {
                        "type": "string",
                        "description": "Updated customer name."
                    },
                    "customer_type": {
                        "type": "string",
                        "enum": ["new", "existing"],
                        "description": "Updated customer type."
                    },
                    "contact_email": {
                        "type": "string",
                        "description": "Updated email address."
                    },
                    "contact_phone": {
                        "type": "string",
                        "description": "Updated phone number."
                    },
                    "kyc_status": {
                        "type": "string",
                        "enum": ["not_started", "pending_customer", "pending_finance_approval", "approved", "rejected"],
                        "description": "Updated KYC status."
                    }
                },
                "required": ["customer_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_process_instance",
            "description": "Start a new process (workflow) for a customer. Use main_process_id 1 for Quotation, 2 for Rate Management & Pricing.",
            "parameters": {
                "type": "object",
                "properties": {
                    "main_process_id": {
                        "type": "integer",
                        "description": "Process type: 1 = Quotation, 2 = Rate Management & Pricing."
                    },
                    "customer_id": {
                        "type": "integer",
                        "description": "The customer this process is for."
                    },
                    "reference_number": {
                        "type": "string",
                        "description": "Reference number, e.g. QUO-2026-0020 or PRC-2026-0015."
                    }
                },
                "required": ["main_process_id", "customer_id", "reference_number"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_step_execution",
            "description": "Log a step execution for a process instance. Records that a specific step is being worked on.",
            "parameters": {
                "type": "object",
                "properties": {
                    "process_instance_id": {
                        "type": "integer",
                        "description": "The process instance this step belongs to."
                    },
                    "step_id": {
                        "type": "integer",
                        "description": "The process step ID (e.g. 11 for step 1.1, 21 for step 2.1)."
                    },
                    "assigned_to_party_id": {
                        "type": "integer",
                        "description": "The responsible party ID: 1=Sales, 2=CS, 3=Finance, 4=Procurement, 5=Customer."
                    },
                    "status": {
                        "type": "string",
                        "enum": ["pending", "in_progress", "completed", "skipped", "blocked"],
                        "description": "Initial status of the step."
                    },
                    "notes": {
                        "type": "string",
                        "description": "Notes about this step execution."
                    }
                },
                "required": ["process_instance_id", "step_id", "assigned_to_party_id", "status"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_step_execution",
            "description": "Update a step execution's status or notes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "step_execution_id": {
                        "type": "integer",
                        "description": "The step execution ID to update."
                    },
                    "status": {
                        "type": "string",
                        "enum": ["pending", "in_progress", "completed", "skipped", "blocked"],
                        "description": "New status."
                    },
                    "notes": {
                        "type": "string",
                        "description": "Updated notes."
                    }
                },
                "required": ["step_execution_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_rate",
            "description": "Add a new shipping rate to AMS.",
            "parameters": {
                "type": "object",
                "properties": {
                    "liner_name": {
                        "type": "string",
                        "description": "Shipping line name, e.g. MSC, Maersk."
                    },
                    "origin": {
                        "type": "string",
                        "description": "Origin port or city."
                    },
                    "destination": {
                        "type": "string",
                        "description": "Destination port or city."
                    },
                    "container_type": {
                        "type": "string",
                        "description": "Container type, e.g. 20'GP, 40'HC."
                    },
                    "rate_type": {
                        "type": "string",
                        "enum": ["contracted", "monthly", "spot"],
                        "description": "Type of rate."
                    },
                    "amount": {
                        "type": "number",
                        "description": "Rate amount."
                    },
                    "currency": {
                        "type": "string",
                        "description": "Currency code, e.g. USD."
                    },
                    "valid_from": {
                        "type": "string",
                        "description": "Start date (YYYY-MM-DD)."
                    },
                    "valid_to": {
                        "type": "string",
                        "description": "End date (YYYY-MM-DD)."
                    }
                },
                "required": ["liner_name", "origin", "destination", "container_type", "rate_type", "amount", "currency", "valid_from", "valid_to"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_rate_request_status",
            "description": "Update a rate request status, e.g. mark it as fulfilled with a resulting rate, or unavailable.",
            "parameters": {
                "type": "object",
                "properties": {
                    "rate_request_id": {
                        "type": "integer",
                        "description": "The rate request ID to update."
                    },
                    "status": {
                        "type": "string",
                        "enum": ["open", "fulfilled", "unavailable"],
                        "description": "New status."
                    },
                    "resulting_rate_id": {
                        "type": "integer",
                        "description": "The rate ID that fulfilled this request (only when status is 'fulfilled')."
                    }
                },
                "required": ["rate_request_id", "status"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_quotation_status",
            "description": "Update a quotation's status, e.g. mark it as sent, accepted, rejected, or expired.",
            "parameters": {
                "type": "object",
                "properties": {
                    "quotation_id": {
                        "type": "integer",
                        "description": "The quotation ID to update."
                    },
                    "status": {
                        "type": "string",
                        "enum": ["draft", "sent", "accepted", "rejected", "expired"],
                        "description": "New status."
                    }
                },
                "required": ["quotation_id", "status"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "send_kyc_form",
            "description": "Send the KYC form to a customer via email. This looks up the customer's email, simulates sending the form, and updates their KYC status to 'pending_customer'. Use this when Sales/CS needs to send a KYC form to a new customer.",
            "parameters": {
                "type": "object",
                "properties": {
                    "customer_id": {
                        "type": "integer",
                        "description": "The customer ID to send the KYC form to."
                    },
                    "message": {
                        "type": "string",
                        "description": "Optional custom message to include in the email."
                    }
                },
                "required": ["customer_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_record",
            "description": "Delete a record from any table by its ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "table_name": {
                        "type": "string",
                        "enum": [
                            "customers", "inquiries", "rates", "rate_requests",
                            "quotations", "process_instances", "step_executions",
                            "step_state_history"
                        ],
                        "description": "The table to delete from."
                    },
                    "record_id": {
                        "type": "integer",
                        "description": "The record ID to delete."
                    }
                },
                "required": ["table_name", "record_id"]
            }
        }
    }
]
