import os
from dotenv import load_dotenv
from psycopg_pool import ConnectionPool

load_dotenv()

POSTGRES_CONN_STR = os.getenv("POSTGRES_CONN_STR")

if not POSTGRES_CONN_STR:
    raise RuntimeError("POSTGRES_CONN_STR is not set in .env")

# Create a connection pool (min 1, max 10 connections)
try:
    pool = ConnectionPool(
        conninfo=POSTGRES_CONN_STR,
        min_size=1,
        max_size=10,
        open=True,
    )
    # Quick check: grab a connection, run a test query, release it
    with pool.connection() as conn:
        row = conn.execute("SELECT version()").fetchone()
        print(f"[db_conn] Connected successfully to PostgreSQL")
        print(f"[db_conn] Server version: {row[0]}")
except Exception as e:
    print(f"[db_conn] Failed to connect to PostgreSQL: {e}")
    raise
