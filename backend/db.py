import mysql.connector
from mysql.connector import pooling
import config

_pool = pooling.MySQLConnectionPool(
    pool_name="torneo_pool",
    pool_size=10,
    host=config.DB_HOST,
    port=config.DB_PORT,
    user=config.DB_USER,
    password=config.DB_PASSWORD,
    database=config.DB_NAME,
    autocommit=False,
)


def get_conn():
    return _pool.get_connection()


def query_one(sql, params=None):
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(sql, params or ())
        row = cur.fetchone()
        cur.close()
        return row
    finally:
        conn.close()


def query_all(sql, params=None):
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(sql, params or ())
        rows = cur.fetchall()
        cur.close()
        return rows
    finally:
        conn.close()


def execute(sql, params=None):
    """Run INSERT/UPDATE/DELETE; return (lastrowid, rowcount)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(sql, params or ())
        conn.commit()
        result = (cur.lastrowid, cur.rowcount)
        cur.close()
        return result
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def execute_many(statements):
    """Run multiple (sql, params) in a single transaction."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        for sql, params in statements:
            cur.execute(sql, params or ())
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
