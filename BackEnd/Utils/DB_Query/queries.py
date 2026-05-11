import json
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parent.parent.parent / "Data" / "mock_data.json"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_data() -> dict:
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_data(data: dict) -> None:
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _next_id(records: list[dict]) -> int:
    if not records:
        return 1
    return max(r["id"] for r in records) + 1


# ---------------------------------------------------------------------------
# Generic CRUD
# ---------------------------------------------------------------------------

def get_all(table_name: str) -> list[dict]:
    data = _load_data()
    return data.get(table_name, [])


def get_by_id(table_name: str, record_id: int) -> dict | None:
    for record in get_all(table_name):
        if record["id"] == record_id:
            return record
    return None


def create(table_name: str, record: dict) -> dict:
    data = _load_data()
    table = data.setdefault(table_name, [])
    record["id"] = _next_id(table)
    table.append(record)
    _save_data(data)
    return record


def update(table_name: str, record_id: int, updates: dict) -> dict | None:
    data = _load_data()
    table = data.get(table_name, [])
    for record in table:
        if record["id"] == record_id:
            record.update(updates)
            record["id"] = record_id  # prevent id overwrite
            _save_data(data)
            return record
    return None


def delete(table_name: str, record_id: int) -> bool:
    data = _load_data()
    table = data.get(table_name, [])
    original_len = len(table)
    data[table_name] = [r for r in table if r["id"] != record_id]
    if len(data[table_name]) < original_len:
        _save_data(data)
        return True
    return False


# ---------------------------------------------------------------------------
# Business-specific searches
# ---------------------------------------------------------------------------

def _matches_str(value: str | None, query: str | None) -> bool:
    if query is None:
        return True
    if value is None:
        return False
    return query.lower() in value.lower()


def _matches_exact(value, query) -> bool:
    if query is None:
        return True
    return value == query


def search_customers(
    name: str | None = None,
    customer_type: str | None = None,
    kyc_status: str | None = None,
) -> list[dict]:
    return [
        c for c in get_all("customers")
        if _matches_str(c.get("name"), name)
        and _matches_exact(c.get("customer_type"), customer_type)
        and _matches_exact(c.get("kyc_status"), kyc_status)
    ]


def search_inquiries(
    customer_id: int | None = None,
    origin: str | None = None,
    destination: str | None = None,
    status: str | None = None,
    channel: str | None = None,
) -> list[dict]:
    return [
        i for i in get_all("inquiries")
        if _matches_exact(i.get("customer_id"), customer_id)
        and _matches_str(i.get("origin"), origin)
        and _matches_str(i.get("destination"), destination)
        and _matches_exact(i.get("status"), status)
        and _matches_exact(i.get("channel"), channel)
    ]


def search_rates(
    origin: str | None = None,
    destination: str | None = None,
    container_type: str | None = None,
    liner_name: str | None = None,
    rate_type: str | None = None,
) -> list[dict]:
    return [
        r for r in get_all("rates")
        if _matches_str(r.get("origin"), origin)
        and _matches_str(r.get("destination"), destination)
        and _matches_str(r.get("container_type"), container_type)
        and _matches_str(r.get("liner_name"), liner_name)
        and _matches_exact(r.get("rate_type"), rate_type)
    ]


def search_process_instances(
    customer_id: int | None = None,
    status: str | None = None,
    main_process_id: int | None = None,
) -> list[dict]:
    return [
        p for p in get_all("process_instances")
        if _matches_exact(p.get("customer_id"), customer_id)
        and _matches_exact(p.get("status"), status)
        and _matches_exact(p.get("main_process_id"), main_process_id)
    ]


def search_quotations(
    process_instance_id: int | None = None,
    inquiry_id: int | None = None,
    status: str | None = None,
) -> list[dict]:
    return [
        q for q in get_all("quotations")
        if _matches_exact(q.get("process_instance_id"), process_instance_id)
        and _matches_exact(q.get("inquiry_id"), inquiry_id)
        and _matches_exact(q.get("status"), status)
    ]


def search_rate_requests(
    status: str | None = None,
    inquiry_id: int | None = None,
) -> list[dict]:
    return [
        rr for rr in get_all("rate_requests")
        if _matches_exact(rr.get("status"), status)
        and _matches_exact(rr.get("inquiry_id"), inquiry_id)
    ]


def get_step_executions_for_instance(process_instance_id: int) -> list[dict]:
    return [
        se for se in get_all("step_executions")
        if se.get("process_instance_id") == process_instance_id
    ]


def get_state_history_for_execution(step_execution_id: int) -> list[dict]:
    return [
        sh for sh in get_all("step_state_history")
        if sh.get("step_execution_id") == step_execution_id
    ]
