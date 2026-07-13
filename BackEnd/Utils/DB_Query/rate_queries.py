"""
PostgreSQL-backed unified rate search across all rate tables.

Queries: contracted_fak_rate, spot_rate (+ vessel_by_vessel_rate, liner_rate),
         nac, special_rt — returns a single flat list the frontend can render.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from psycopg.rows import dict_row

# Pool lives in BackEnd/Data/db_conn.py; import path depends on how the app
# is launched (from BackEnd/ via uvicorn main:app).
from Data.db_conn import pool


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clean(row: dict) -> dict:
    """Convert DB-native types (date, datetime, Decimal) to JSON-safe values."""
    out: dict = {}
    for k, v in row.items():
        if isinstance(v, Decimal):
            out[k] = float(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, date):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


def _fetchall(conn, sql: str, params: list | tuple = ()) -> list[dict]:
    """Execute SQL with dict_row cursor and return all rows."""
    cur = conn.cursor(row_factory=dict_row)
    cur.execute(sql, params)
    return cur.fetchall()


def _fetchone(conn, sql: str, params: list | tuple = ()):
    """Execute SQL with dict_row cursor and return one row or None."""
    cur = conn.cursor(row_factory=dict_row)
    cur.execute(sql, params)
    return cur.fetchone()


# ---------------------------------------------------------------------------
# Port list (for datalist autocomplete)
# ---------------------------------------------------------------------------

def get_ports() -> list[dict]:
    """Return all ports ordered by name."""
    with pool.connection() as conn:
        rows = _fetchall(conn, "SELECT port_id, name, country FROM port ORDER BY name")
    return [_clean(r) for r in rows]


def get_liners() -> list[dict]:
    """Return all liners ordered by name."""
    with pool.connection() as conn:
        rows = _fetchall(conn, "SELECT lin_id, name, is_on_inttra, has_portal FROM liner ORDER BY name")
    return [_clean(r) for r in rows]


def get_trade_lanes() -> list[dict]:
    """Return all trade lanes ordered by name."""
    with pool.connection() as conn:
        rows = _fetchall(conn, "SELECT trln_id, trln_name FROM trade_lane ORDER BY trln_name")
    return [_clean(r) for r in rows]


def get_contact_persons() -> list[dict]:
    """Return all contact persons with their client name."""
    with pool.connection() as conn:
        rows = _fetchall(
            conn,
            """SELECT cp.cp_id, cp.name, cp.email, cp.whatsapp, cp.wechat,
                      c.cli_id, c.name AS client_name
               FROM contact_person cp
               JOIN client c ON c.cli_id = cp.cli_id
               ORDER BY c.name, cp.name""",
        )
    return [_clean(r) for r in rows]


def get_employees_db() -> list[dict]:
    """Return all employees from the DB."""
    with pool.connection() as conn:
        rows = _fetchall(conn, "SELECT emp_id, name, desig, dept FROM employee ORDER BY name")
    return [_clean(r) for r in rows]


def get_clients() -> list[dict]:
    """Return all clients for dropdown selection."""
    with pool.connection() as conn:
        rows = _fetchall(
            conn,
            """SELECT cli_id, name, vat_no, credit_limit, kyc_completed, city
               FROM client ORDER BY name""",
        )
    return [_clean(r) for r in rows]


# ---------------------------------------------------------------------------
# Unified rate search
# ---------------------------------------------------------------------------

def search_all_rates(
    origin: str | None = None,
    destination: str | None = None,
    container_type: str | None = None,
) -> list[dict]:
    """
    Search ALL rate tables for rates matching origin -> destination route and
    optional container_type filter.

    Resolution path:
      origin/destination text  ->  port_id (ILIKE)
      (pol_id, pod_id)         ->  port_pair  ->  trln_id  (trade lane)
      trln_id + container_type ->  filter each rate table

    NAC rates are matched by origin/destination TEXT (not trade lane).
    Special rates are returned as-is (commodity-level, not route-specific).
    """
    results: list[dict] = []

    with pool.connection() as conn:
        # --- Resolve ports -------------------------------------------------
        pol_ids: list[int] = []
        pod_ids: list[int] = []
        origin_name = origin or ""
        dest_name = destination or ""

        if origin:
            rows = _fetchall(
                conn,
                "SELECT port_id, name FROM port WHERE name ILIKE %s",
                (f"%{origin}%",),
            )
            pol_ids = [r["port_id"] for r in rows]
            if rows:
                origin_name = rows[0]["name"]

        if destination:
            rows = _fetchall(
                conn,
                "SELECT port_id, name FROM port WHERE name ILIKE %s",
                (f"%{destination}%",),
            )
            pod_ids = [r["port_id"] for r in rows]
            if rows:
                dest_name = rows[0]["name"]

        # --- Resolve trade lanes via port_pair -----------------------------
        trln_ids: list[int] = []
        if pol_ids and pod_ids:
            placeholders_pol = ",".join(["%s"] * len(pol_ids))
            placeholders_pod = ",".join(["%s"] * len(pod_ids))
            pp_rows = _fetchall(
                conn,
                f"""SELECT DISTINCT trln_id FROM port_pair
                    WHERE pol_id IN ({placeholders_pol})
                      AND pod_id IN ({placeholders_pod})""",
                pol_ids + pod_ids,
            )
            trln_ids = [r["trln_id"] for r in pp_rows]

        # If no trade lanes found, search all trade lanes as fallback
        search_all_lanes = not trln_ids

        # --- Helper: build WHERE clause for trln + container ---------------
        def _trln_container_clause(
            trln_col: str = "r.trln_id",
            ct_col: str = "r.container_type",
        ) -> tuple[str, list[Any]]:
            clauses: list[str] = []
            params: list[Any] = []
            if trln_ids and not search_all_lanes:
                ph = ",".join(["%s"] * len(trln_ids))
                clauses.append(f"{trln_col} IN ({ph})")
                params.extend(trln_ids)
            if container_type:
                clauses.append(f"{ct_col} ILIKE %s")
                params.append(f"%{container_type}%")
            where = " AND ".join(clauses) if clauses else "TRUE"
            return where, params

        # --- 1. Contracted / FAK rates -------------------------------------
        where, params = _trln_container_clause()
        cfr_rows = _fetchall(
            conn,
            f"""SELECT r.crate_id, r.type, r.rate, r.container_type,
                       r.currency, r.valid_from, r.valid_to, r.remark,
                       r.service_scope,
                       l.name AS liner_name, t.trln_name AS trade_lane
                FROM contracted_fak_rate r
                JOIN liner l ON l.lin_id = r.lin_id
                JOIN trade_lane t ON t.trln_id = r.trln_id
                WHERE {where}
                ORDER BY r.rate""",
            params,
        )
        for row in cfr_rows:
            r = _clean(row)
            results.append({
                "id": f"contracted_fak_rate:{r['crate_id']}",
                "source_type": r["type"],           # "Contracted" or "FAK"
                "liner_name": r["liner_name"],
                "origin": origin_name,
                "destination": dest_name,
                "container_type": r["container_type"],
                "rate": r["rate"],
                "currency": r.get("currency", "USD"),
                "valid_from": r["valid_from"],
                "valid_to": r["valid_to"],
                "trade_lane": r["trade_lane"],
                "vessel_name": None,
                "departure_date": None,
                "is_sold": None,
                "service_scope": r.get("service_scope"),
                "client_name": None,
                "contact_person_name": None,
                "employee_name": None,
                "commodity_name": None,
                "commodity_type": None,
                "remark": r.get("remark"),
            })

        # --- 2. Vessel-by-Vessel spot rates --------------------------------
        where, params = _trln_container_clause(trln_col="s.trln_id", ct_col="s.container_type")
        vbv_rows = _fetchall(
            conn,
            f"""SELECT s.srid, s.container_type, s.rate AS spot_rate_amt,
                       s.is_sold, s.valid_from, s.valid_to, s.remark,
                       s.service_scope,
                       v.vess_id, v.rate AS vbv_rate,
                       v.departure_date, v.loading_start_date, v.loading_end_date,
                       l.name AS liner_name, t.trln_name AS trade_lane
                FROM spot_rate s
                JOIN vessel_by_vessel_rate v ON v.srid = s.srid
                JOIN liner l ON l.lin_id = s.lin_id
                JOIN trade_lane t ON t.trln_id = s.trln_id
                WHERE {where}
                ORDER BY COALESCE(v.rate, s.rate)""",
            params,
        )
        for row in vbv_rows:
            r = _clean(row)
            results.append({
                "id": f"vessel_by_vessel_rate:{r['srid']}",
                "source_type": "Vessel-by-Vessel",
                "liner_name": r["liner_name"],
                "origin": origin_name,
                "destination": dest_name,
                "container_type": r["container_type"],
                "rate": r["vbv_rate"] or r["spot_rate_amt"],
                "currency": "USD",
                "valid_from": r["valid_from"],
                "valid_to": r["valid_to"],
                "trade_lane": r["trade_lane"],
                "vessel_name": r["vess_id"],
                "departure_date": r["departure_date"],
                "is_sold": r["is_sold"],
                "service_scope": r.get("service_scope"),
                "client_name": None,
                "contact_person_name": None,
                "employee_name": None,
                "commodity_name": None,
                "commodity_type": None,
                "remark": r.get("remark"),
            })

        # --- 3. Liner rates (spot_rate subtype) ----------------------------
        where, params = _trln_container_clause(trln_col="s.trln_id", ct_col="s.container_type")
        lr_rows = _fetchall(
            conn,
            f"""SELECT s.srid, s.container_type, s.rate, s.is_sold,
                       s.valid_from, s.valid_to, s.remark,
                       s.service_scope,
                       l.name AS liner_name, t.trln_name AS trade_lane
                FROM spot_rate s
                JOIN liner_rate lr ON lr.srid = s.srid
                JOIN liner l ON l.lin_id = s.lin_id
                JOIN trade_lane t ON t.trln_id = s.trln_id
                WHERE {where}
                ORDER BY s.rate""",
            params,
        )
        for row in lr_rows:
            r = _clean(row)
            results.append({
                "id": f"liner_rate:{r['srid']}",
                "source_type": "Tariff Rate",
                "liner_name": r["liner_name"],
                "origin": origin_name,
                "destination": dest_name,
                "container_type": r["container_type"],
                "rate": r["rate"],
                "currency": "USD",
                "valid_from": r["valid_from"],
                "valid_to": r["valid_to"],
                "trade_lane": r["trade_lane"],
                "vessel_name": None,
                "departure_date": None,
                "is_sold": r["is_sold"],
                "service_scope": r.get("service_scope"),
                "client_name": None,
                "contact_person_name": None,
                "employee_name": None,
                "commodity_name": None,
                "commodity_type": None,
                "remark": r.get("remark"),
            })

        # --- 3b. Pure Spot rates (not VbV or Tariff Rate subtypes) ----------
        where, params = _trln_container_clause(trln_col="s.trln_id", ct_col="s.container_type")
        spot_rows = _fetchall(
            conn,
            f"""SELECT s.srid, s.container_type, s.rate, s.is_sold,
                       s.valid_from, s.valid_to, s.remark,
                       s.service_scope,
                       l.name AS liner_name, t.trln_name AS trade_lane
                FROM spot_rate s
                JOIN liner l ON l.lin_id = s.lin_id
                JOIN trade_lane t ON t.trln_id = s.trln_id
                WHERE s.srid NOT IN (SELECT srid FROM vessel_by_vessel_rate)
                  AND s.srid NOT IN (SELECT srid FROM liner_rate)
                  AND {where}
                ORDER BY s.rate""",
            params,
        )
        for row in spot_rows:
            r = _clean(row)
            results.append({
                "id": f"spot_rate:{r['srid']}",
                "source_type": "Spot",
                "liner_name": r["liner_name"],
                "origin": origin_name,
                "destination": dest_name,
                "container_type": r["container_type"],
                "rate": r["rate"],
                "currency": "USD",
                "valid_from": r["valid_from"],
                "valid_to": r["valid_to"],
                "trade_lane": r["trade_lane"],
                "vessel_name": None,
                "departure_date": None,
                "is_sold": r["is_sold"],
                "service_scope": r.get("service_scope"),
                "client_name": None,
                "contact_person_name": None,
                "employee_name": None,
                "commodity_name": None,
                "commodity_type": None,
                "remark": r.get("remark"),
            })

        # --- 4. NAC rates (matched on origin/destination TEXT) -------------
        nac_clauses: list[str] = []
        nac_params: list[Any] = []
        if origin:
            nac_clauses.append("n.origin ILIKE %s")
            nac_params.append(f"%{origin}%")
        if destination:
            nac_clauses.append("n.destination ILIKE %s")
            nac_params.append(f"%{destination}%")
        nac_where = " AND ".join(nac_clauses) if nac_clauses else "TRUE"

        nac_rows = _fetchall(
            conn,
            f"""SELECT n.nac_id, n.origin, n.destination, n.rate,
                       n.valid_from, n.valid_to, n.remark,
                       n.service_scope,
                       t.trln_name AS trade_lane,
                       c.name AS client_name,
                       cp.name AS contact_person_name,
                       e.name AS employee_name
                FROM nac n
                JOIN trade_lane t ON t.trln_id = n.trln_id
                LEFT JOIN contact_person cp ON cp.cp_id = n.cp_id
                LEFT JOIN client c ON c.cli_id = cp.cli_id
                LEFT JOIN employee e ON e.emp_id = n.emp_id
                WHERE {nac_where}
                ORDER BY n.rate""",
            nac_params,
        )
        for row in nac_rows:
            r = _clean(row)
            results.append({
                "id": f"nac:{r['nac_id']}",
                "source_type": "NAC",
                "liner_name": None,
                "origin": r["origin"],
                "destination": r["destination"],
                "container_type": None,
                "rate": r["rate"],
                "currency": "USD",
                "valid_from": r["valid_from"],
                "valid_to": r["valid_to"],
                "trade_lane": r["trade_lane"],
                "vessel_name": None,
                "departure_date": None,
                "is_sold": None,
                "service_scope": r.get("service_scope"),
                "client_name": r.get("client_name"),
                "contact_person_name": r.get("contact_person_name"),
                "employee_name": r.get("employee_name"),
                "commodity_name": None,
                "commodity_type": None,
                "remark": r.get("remark"),
            })

        # --- 5. Special rates (commodity-level, not route-specific) --------
        # JOIN commodity_container to get the commodity name & type linked via sprid FK.
        spr_rows = _fetchall(
            conn,
            """SELECT sr.sprid, sr.rate, sr.valid_from, sr.valid_to, sr.remark,
                      sr.service_scope,
                      (SELECT name FROM commodity_container WHERE sprid = sr.sprid LIMIT 1) AS commodity_name,
                      (SELECT type FROM commodity_container WHERE sprid = sr.sprid LIMIT 1) AS commodity_type
               FROM special_rt sr
               ORDER BY sr.rate""",
        )
        for row in spr_rows:
            r = _clean(row)
            results.append({
                "id": f"special_rt:{r['sprid']}",
                "source_type": "Special",
                "liner_name": None,
                "origin": None,
                "destination": None,
                "container_type": None,
                "rate": r["rate"],
                "currency": "USD",
                "valid_from": r["valid_from"],
                "valid_to": r["valid_to"],
                "trade_lane": None,
                "vessel_name": None,
                "departure_date": None,
                "is_sold": None,
                "service_scope": r.get("service_scope"),
                "client_name": None,
                "contact_person_name": None,
                "employee_name": None,
                "commodity_name": r.get("commodity_name"),
                "commodity_type": r.get("commodity_type"),
                "remark": r.get("remark"),
            })

    # Sort by rate (nulls last)
    results.sort(key=lambda r: r["rate"] if r["rate"] is not None else float("inf"))
    return results


# ---------------------------------------------------------------------------
# Rate update
# ---------------------------------------------------------------------------

# Allowed editable fields per table
_ALLOWED_FIELDS: dict[str, set[str]] = {
    "contracted_fak_rate": {"rate", "container_type", "currency", "service_scope", "valid_from", "valid_to", "remark"},
    "spot_rate":           {"rate", "container_type", "currency", "is_sold", "service_scope", "valid_from", "valid_to", "remark"},
    "vessel_by_vessel_rate": {"rate", "departure_date", "loading_start_date", "loading_end_date"},
    "liner_rate":          set(),  # no own cols — edits go to parent spot_rate
    "nac":                 {"rate", "origin", "destination", "currency", "service_scope", "valid_from", "valid_to", "remark"},
    "special_rt":          {"rate", "currency", "service_scope", "valid_from", "valid_to", "remark"},
}

# PK column per table
_PK: dict[str, str] = {
    "contracted_fak_rate": "crate_id",
    "spot_rate": "srid",
    "vessel_by_vessel_rate": "srid",
    "liner_rate": "srid",
    "nac": "nac_id",
    "special_rt": "sprid",
}


def update_rate(rate_id: str, patch: dict) -> bool:
    """
    Update a rate by its composite ID (e.g. 'contracted_fak_rate:3').

    For vessel_by_vessel_rate and liner_rate (ISA subtypes of spot_rate),
    fields like rate/remark/is_sold/container_type go to the parent spot_rate row.
    """
    parts = rate_id.split(":", 1)
    if len(parts) != 2:
        return False

    table, pk_str = parts
    if table not in _PK:
        return False
    try:
        pk = int(pk_str)
    except ValueError:
        return False

    with pool.connection() as conn:
        # --- Vessel-by-Vessel: split patch between spot_rate and vbv table ---
        if table == "vessel_by_vessel_rate":
            vbv_allowed = _ALLOWED_FIELDS["vessel_by_vessel_rate"]
            spot_allowed = _ALLOWED_FIELDS["spot_rate"]
            vbv_patch = {k: v for k, v in patch.items() if k in vbv_allowed}
            spot_patch = {k: v for k, v in patch.items() if k in spot_allowed}
            if vbv_patch:
                _do_update(conn, "vessel_by_vessel_rate", "srid", pk, vbv_patch)
            if spot_patch:
                _do_update(conn, "spot_rate", "srid", pk, spot_patch)
            conn.commit()
            return True

        # --- Tariff Rate: all editable fields live on parent spot_rate --------
        if table == "liner_rate":
            spot_patch = {k: v for k, v in patch.items() if k in _ALLOWED_FIELDS["spot_rate"]}
            if spot_patch:
                _do_update(conn, "spot_rate", "srid", pk, spot_patch)
            conn.commit()
            return True

        # --- All other tables: direct update --------------------------------
        allowed = _ALLOWED_FIELDS.get(table, set())
        filtered = {k: v for k, v in patch.items() if k in allowed}
        if not filtered:
            return True  # nothing to update, but not an error
        _do_update(conn, table, _PK[table], pk, filtered)
        conn.commit()
        return True


def _do_update(conn, table: str, pk_col: str, pk_val: int, fields: dict):
    """Build and execute a parameterised UPDATE for the given fields."""
    set_parts: list[str] = []
    values: list[Any] = []
    for col, val in fields.items():
        set_parts.append(f"{col} = %s")
        values.append(val)
    values.append(pk_val)
    sql = f"UPDATE {table} SET {', '.join(set_parts)} WHERE {pk_col} = %s"
    conn.cursor().execute(sql, values)
