import sqlite3
import os
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

DB_PATH = os.environ.get("DATABASE_PATH", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "qrcodes.db"))

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# ==================== PASSWORD SECURITY ====================

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    pw_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return f"{salt}${pw_hash.hex()}"

def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, expected = stored_hash.split("$", 1)
        test = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000).hex()
        return hmac.compare_digest(expected, test)
    except Exception:
        return False

# ==================== DATABASE INITIALIZATION ====================

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT DEFAULT '',
        role TEXT DEFAULT 'member',
        created_at TEXT NOT NULL
    );
    """)

    # Active user sessions
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # Dynamic QR codes table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS qrcodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER DEFAULT 1,
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
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)

    # Safe column migration for existing databases
    cursor.execute("PRAGMA table_info(qrcodes);")
    columns = [row["name"] for row in cursor.fetchall()]
    if "user_id" not in columns:
        cursor.execute("ALTER TABLE qrcodes ADD COLUMN user_id INTEGER DEFAULT 1;")
    
    # Scans analytics table
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

    # Global and system settings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """)

    # Indices
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_qrcodes_qr_id ON qrcodes(qr_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_qrcodes_order_id ON qrcodes(order_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_qrcodes_user_id ON qrcodes(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_scans_qr_id ON scans(qr_id);")
    
    conn.commit()
    conn.close()

# ==================== USER & SESSION MANAGEMENT ====================

def create_user(username: str, email: str, password: str, full_name: str = "", role: str = "member") -> Dict[str, Any]:
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    pw_hash = hash_password(password)
    cursor.execute("""
        INSERT INTO users (username, email, password_hash, full_name, role, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (username.strip().lower(), email.strip().lower(), pw_hash, full_name.strip(), role, now))
    user_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return get_user_by_id(user_id)

def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, email, full_name, role, created_at FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_user_by_identifier(identifier: str) -> Optional[Dict[str, Any]]:
    clean = identifier.strip().lower()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ? OR email = ?", (clean, clean))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def count_users() -> int:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as count FROM users")
    cnt = cursor.fetchone()["count"]
    conn.close()
    return cnt

def create_session(user_id: int, days: int = 30) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now()
    expires = now + timedelta(days=days)
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO sessions (token, user_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
    """, (token, user_id, now.isoformat(), expires.isoformat()))
    conn.commit()
    conn.close()
    return token

def get_user_by_session_token(token: str) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.id, u.username, u.email, u.full_name, u.role, u.created_at, s.expires_at
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = ?
    """, (token,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    try:
        if datetime.fromisoformat(row["expires_at"]) < datetime.now():
            delete_session(token)
            return None
    except Exception:
        pass
    return {
        "id": row["id"],
        "username": row["username"],
        "email": row["email"],
        "full_name": row["full_name"],
        "role": row["role"],
        "created_at": row["created_at"]
    }

def delete_session(token: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()

# ==================== SETTINGS ====================

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

# ==================== QR CODES ====================

def list_qrcodes(user_id: Optional[int] = None, search: str = "", order_filter: str = "", status_filter: str = "") -> List[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    query = "SELECT * FROM qrcodes WHERE 1=1"
    params = []

    if user_id is not None:
        query += " AND user_id = ?"
        params.append(user_id)

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

def get_qrcode_by_id(qr_id: str, user_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    if user_id is not None:
        cursor.execute("SELECT * FROM qrcodes WHERE qr_id = ? AND user_id = ?", (qr_id, user_id))
    else:
        cursor.execute("SELECT * FROM qrcodes WHERE qr_id = ?", (qr_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def create_qrcode(qr_id: str, title: str, target_url: str, user_id: int = 1,
                  order_id: str = "", color: str = "#000000", transparent_bg: bool = True, 
                  bg_color: str = "transparent", notes: str = "") -> Dict[str, Any]:
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute("""
    INSERT INTO qrcodes (user_id, qr_id, order_id, title, target_url, status, color, bg_color, transparent_bg, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)
    """, (user_id, qr_id, order_id.strip(), title.strip(), target_url.strip(), color, bg_color, 1 if transparent_bg else 0, notes.strip(), now, now))
    conn.commit()
    conn.close()
    return get_qrcode_by_id(qr_id, user_id=user_id)

def update_qrcode(qr_id: str, user_id: Optional[int] = None,
                  title: Optional[str] = None, target_url: Optional[str] = None, 
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
    where_clause = "WHERE qr_id = ?"
    if user_id is not None:
        where_clause += " AND user_id = ?"
        params.append(user_id)

    query = f"UPDATE qrcodes SET {', '.join(fields)} {where_clause}"
    cursor.execute(query, params)
    conn.commit()
    conn.close()
    return get_qrcode_by_id(qr_id, user_id=user_id)

def delete_qrcode(qr_id: str, user_id: Optional[int] = None) -> bool:
    conn = get_db()
    cursor = conn.cursor()
    if user_id is not None:
        cursor.execute("SELECT id FROM qrcodes WHERE qr_id = ? AND user_id = ?", (qr_id, user_id))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return False
        cursor.execute("DELETE FROM scans WHERE qr_id = ?", (qr_id,))
        cursor.execute("DELETE FROM qrcodes WHERE qr_id = ? AND user_id = ?", (qr_id, user_id))
    else:
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

def get_stats(user_id: Optional[int] = None) -> Dict[str, Any]:
    conn = get_db()
    cursor = conn.cursor()
    
    where = "WHERE user_id = ?" if user_id is not None else ""
    params = (user_id,) if user_id is not None else ()

    cursor.execute(f"SELECT COUNT(*) as total_qr FROM qrcodes {where}", params)
    total_qr = cursor.fetchone()["total_qr"]
    
    cursor.execute(f"SELECT COALESCE(SUM(scan_count), 0) as total_scans FROM qrcodes {where}", params)
    total_scans = cursor.fetchone()["total_scans"]

    and_clause = "AND user_id = ?" if user_id is not None else ""
    cursor.execute(f"SELECT COUNT(DISTINCT order_id) as total_orders FROM qrcodes WHERE order_id != '' {and_clause}", params)
    total_orders = cursor.fetchone()["total_orders"]

    active_where = "WHERE status = 'active'" + (" AND user_id = ?" if user_id is not None else "")
    cursor.execute(f"SELECT COUNT(*) as active_count FROM qrcodes {active_where}", params)
    active_count = cursor.fetchone()["active_count"]

    conn.close()
    return {
        "total_qr": total_qr,
        "total_scans": total_scans,
        "total_orders": total_orders,
        "active_count": active_count
    }
