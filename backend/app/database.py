import os
import sqlite3
from pathlib import Path

DB_PATH = os.getenv("BAGO_DB_PATH", os.getenv("BAGGO_DB_PATH", str(Path(__file__).resolve().parents[1] / "locker.db")))

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def _ensure_column(conn, table: str, column: str, definition: str):
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS lockers (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'AVAILABLE',
            station_name TEXT DEFAULT 'Trạm MVP',
            is_active INTEGER DEFAULT 1,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO lockers (id, name, status) VALUES (1, 'Ngăn 1', 'AVAILABLE');
        INSERT OR IGNORE INTO lockers (id, name, status) VALUES (2, 'Ngăn 2', 'AVAILABLE');
        INSERT OR IGNORE INTO lockers (id, name, status) VALUES (3, 'Ngăn 3', 'AVAILABLE');
        INSERT OR IGNORE INTO lockers (id, name, status) VALUES (4, 'Ngăn 4', 'AVAILABLE');
        INSERT OR IGNORE INTO lockers (id, name, status) VALUES (5, 'Ngăn 5', 'AVAILABLE');
        INSERT OR IGNORE INTO lockers (id, name, status) VALUES (6, 'Ngăn 6', 'AVAILABLE');

        CREATE TABLE IF NOT EXISTS rentals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            locker_id INTEGER NOT NULL,
            start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            end_time TIMESTAMP,
            status TEXT DEFAULT 'RESERVED',
            price REAL DEFAULT 0,
            penalty REAL DEFAULT 0,
            phone TEXT,
            access_code TEXT,
            otp_code TEXT,
            payment_status TEXT DEFAULT 'PENDING',
            paid_at TIMESTAMP,
            returned_at TIMESTAMP,
            FOREIGN KEY (locker_id) REFERENCES lockers(id)
        );

        CREATE TABLE IF NOT EXISTS face_embeddings_active (
            rental_id INTEGER PRIMARY KEY,
            embedding BLOB NOT NULL,
            FOREIGN KEY (rental_id) REFERENCES rentals(id)
        );

        CREATE TABLE IF NOT EXISTS face_embeddings_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rental_id INTEGER NOT NULL,
            embedding BLOB NOT NULL,
            deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (rental_id) REFERENCES rentals(id)
        );

        CREATE TABLE IF NOT EXISTS action_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            locker_id INTEGER,
            actor TEXT,
            action TEXT,
            detail TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS stations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            address TEXT
        );
        INSERT OR IGNORE INTO stations (name, latitude, longitude, address) VALUES ('Trạm MVP', 10.7725, 106.6679, '100 Đường 3/2, Quận 10, TP. Hồ Chí Minh');
        INSERT OR IGNORE INTO stations (name, latitude, longitude, address) VALUES ('Trạm Bago Quận 1', 10.7769, 106.7009, 'Hồ Tùng Mậu, Bến Nghé, Quận 1, TP. Hồ Chí Minh');
        INSERT OR IGNORE INTO stations (name, latitude, longitude, address) VALUES ('Trạm Bago Quận 3', 10.7798, 106.6818, '200 Nguyễn Đình Chiểu, Võ Thị Sáu, Quận 3, TP. Hồ Chí Minh');

        CREATE TABLE IF NOT EXISTS advertisements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            position TEXT NOT NULL,
            text TEXT NOT NULL,
            link_url TEXT,
            image_url TEXT,
            priority INTEGER DEFAULT 1,
            is_active INTEGER DEFAULT 1,
            impressions INTEGER DEFAULT 0,
            clicks INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    _ensure_column(conn, "lockers", "station_name", "TEXT DEFAULT 'Trạm MVP'")
    _ensure_column(conn, "lockers", "is_active", "INTEGER DEFAULT 1")
    _ensure_column(conn, "lockers", "locked", "INTEGER DEFAULT 1")
    _ensure_column(conn, "lockers", "unlocking", "INTEGER DEFAULT 0")
    _ensure_column(conn, "lockers", "door_open", "INTEGER DEFAULT 0")
    _ensure_column(conn, "lockers", "sensor_raw", "INTEGER")
    _ensure_column(conn, "lockers", "hardware_online", "INTEGER DEFAULT 0")
    _ensure_column(conn, "lockers", "hardware_last_seen", "TIMESTAMP")
    # Do not show stale online state while the backend is restarting. A retained
    # MQTT online/status message will set the connected devices back to online.
    conn.execute("UPDATE lockers SET hardware_online = 0")
    _ensure_column(conn, "rentals", "phone", "TEXT")
    _ensure_column(conn, "rentals", "access_code", "TEXT")
    _ensure_column(conn, "rentals", "otp_code", "TEXT")
    _ensure_column(conn, "rentals", "payment_status", "TEXT DEFAULT 'PENDING'")
    _ensure_column(conn, "rentals", "paid_at", "TIMESTAMP")
    _ensure_column(conn, "rentals", "returned_at", "TIMESTAMP")
    conn.execute("UPDATE rentals SET payment_status = 'PAID' WHERE payment_status IS NULL AND status IN ('OCCUPIED','OVERTIME','COMPLETED')")
    conn.execute("UPDATE rentals SET payment_status = 'PENDING' WHERE payment_status IS NULL")
    defaults = {
        "station_name": "Trạm MVP",
        "price_per_hour": "10000",
        "overtime_price_per_hour": "15000",
        "min_rental_hours": "1",
        "max_rental_hours": "24",
        "reservation_hold_seconds": os.getenv("RESERVATION_HOLD_SECONDS", "120"),
    }
    for key, value in defaults.items():
        conn.execute(
            "INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)",
            (key, value),
        )
    conn.commit()
    conn.close()
