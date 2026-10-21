import sqlite3
import os
from datetime import datetime
from typing import Optional, List, Dict, Any

DB_PATH = os.environ.get("DATABASE_PATH", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "qrcodes.db"))

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS qrcodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        qr_id TEXT UNIQUE NOT NULL,
        order_id TEXT DEFAULT '',
        title TEXT NOT NULL,
        target_url TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        color TEXT DEFAULT '#000000',
        bg_color TEXT DEFAULT 'transparent',
        transparent_bg INTEGER DEFAULT 1,
        scan_count INTEGER DEFAULT 0,
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    """)
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        qr_id TEXT NOT NULL,
        scanned_at TEXT NOT NULL,
        user_agent TEXT DEFAULT '',
        ip_address TEXT DEFAULT '',
        FOREIGN KEY (qr_id) REFERENCES qrcodes(qr_id) ON DELETE CASCADE
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """)

    # Indices for blazing-fast lookups
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_qrcodes_qr_id ON qrcodes(qr_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_qrcodes_order_id ON qrcodes(order_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_scans_qr_id ON scans(qr_id);")
    
    conn.commit()
    conn.close()

def get_setting(key: str, default: str = "") -> str:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    return row["value"] if row else default

def set_setting(key: str, value: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, value))
    conn.commit()
    conn.close()

def list_qrcodes(search: str = "", order_filter: str = "", status_filter: str = "") -> List[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    query = "SELECT * FROM qrcodes WHERE 1=1"
    params = []

    if search:
        search_pattern = f"%{search}%"
        query += " AND (qr_id LIKE ? OR order_id LIKE ? OR title LIKE ? OR target_url LIKE ?)"
        params.extend([search_pattern, search_pattern, search_pattern, search_pattern])

    if order_filter:
        query += " AND order_id = ?"
        params.append(order_filter)

    if status_filter:
        query += " AND status = ?"
        params.append(status_filter)

    query += " ORDER BY id DESC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_qrcode_by_id(qr_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM qrcodes WHERE qr_id = ?", (qr_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def create_qrcode(qr_id: str, title: str, target_url: str, order_id: str = "", 
                  color: str = "#000000", transparent_bg: bool = True, 
                  bg_color: str = "transparent", notes: str = "") -> Dict[str, Any]:
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute("""
    INSERT INTO qrcodes (qr_id, order_id, title, target_url, status, color, bg_color, transparent_bg, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)
    """, (qr_id, order_id.strip(), title.strip(), target_url.strip(), color, bg_color, 1 if transparent_bg else 0, notes.strip(), now, now))
    conn.commit()
    conn.close()
    return get_qrcode_by_id(qr_id)

def update_qrcode(qr_id: str, title: Optional[str] = None, target_url: Optional[str] = None, 
                  order_id: Optional[str] = None, status: Optional[str] = None,
                  color: Optional[str] = None, transparent_bg: Optional[bool] = None,
                  notes: Optional[str] = None) -> Optional[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    
    fields = ["updated_at = ?"]
    params = [now]
    
    if title is not None:
        fields.append("title = ?")
        params.append(title.strip())
    if target_url is not None:
        fields.append("target_url = ?")
        params.append(target_url.strip())
    if order_id is not None:
        fields.append("order_id = ?")
        params.append(order_id.strip())
    if status is not None:
        fields.append("status = ?")
        params.append(status.strip())
    if color is not None:
        fields.append("color = ?")
        params.append(color.strip())
    if transparent_bg is not None:
        fields.append("transparent_bg = ?")
        params.append(1 if transparent_bg else 0)
    if notes is not None:
        fields.append("notes = ?")
        params.append(notes.strip())
        
    params.append(qr_id)
    query = f"UPDATE qrcodes SET {', '.join(fields)} WHERE qr_id = ?"
    cursor.execute(query, params)
    conn.commit()
    conn.close()
    return get_qrcode_by_id(qr_id)

def delete_qrcode(qr_id: str) -> bool:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM scans WHERE qr_id = ?", (qr_id,))
    cursor.execute("DELETE FROM qrcodes WHERE qr_id = ?", (qr_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def record_scan(qr_id: str, user_agent: str = "", ip_address: str = ""):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute("UPDATE qrcodes SET scan_count = scan_count + 1 WHERE qr_id = ?", (qr_id,))
    cursor.execute("INSERT INTO scans (qr_id, scanned_at, user_agent, ip_address) VALUES (?, ?, ?, ?)",
                   (qr_id, now, user_agent, ip_address))
    conn.commit()
    conn.close()

def get_stats() -> Dict[str, Any]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as total_qr FROM qrcodes")
    total_qr = cursor.fetchone()["total_qr"]
    
    cursor.execute("SELECT COALESCE(SUM(scan_count), 0) as total_scans FROM qrcodes")
    total_scans = cursor.fetchone()["total_scans"]

    cursor.execute("SELECT COUNT(DISTINCT order_id) as total_orders FROM qrcodes WHERE order_id != ''")
    total_orders = cursor.fetchone()["total_orders"]

    cursor.execute("SELECT COUNT(*) as active_count FROM qrcodes WHERE status = 'active'")
    active_count = cursor.fetchone()["active_count"]

    conn.close()
    return {
        "total_qr": total_qr,
        "total_scans": total_scans,
        "total_orders": total_orders,
        "active_count": active_count
    }
