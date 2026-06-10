import datetime
import os
import secrets
import string
from typing import Any

from app.database import get_db
from app.services.locker_state import decorate_rental_row

ACTIVE_RENTAL_STATUSES = ("RESERVED", "OCCUPIED", "OVERTIME")
PRICE_PER_HOUR = 10000
RESERVATION_HOLD_SECONDS = int(os.getenv("RESERVATION_HOLD_SECONDS", "120"))


def generate_access_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def parse_db_datetime(value: Any):
    if value is None or isinstance(value, datetime.datetime):
        return value
    text = str(value)
    for fmt in (
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
    ):
        try:
            return datetime.datetime.strptime(text, fmt)
        except ValueError:
            pass
    try:
        return datetime.datetime.fromisoformat(text)
    except ValueError:
        return None


def format_time_left(end_time: Any) -> dict:
    end_dt = parse_db_datetime(end_time)
    if end_dt is None:
        return {"time_left": "Không xác định", "time_left_seconds": 0, "is_overtime": False}

    seconds = int((end_dt - datetime.datetime.now()).total_seconds())
    is_overtime = seconds < 0
    abs_seconds = abs(seconds)
    hours = abs_seconds // 3600
    minutes = (abs_seconds % 3600) // 60
    label = f"{hours} giờ {minutes} phút"
    if is_overtime:
        label = f"Quá hạn {label}"
    else:
        label = f"Còn {label}"
    return {"time_left": label, "time_left_seconds": seconds, "is_overtime": is_overtime}


def rental_to_dict(row) -> dict:
    data = dict(row)
    data.update(format_time_left(data.get("end_time")))
    return decorate_rental_row(data)


def log_action(locker_id: int | None, actor: str, action: str, detail: str):
    conn = get_db()
    conn.execute(
        "INSERT INTO action_logs (locker_id, actor, action, detail) VALUES (?, ?, ?, ?)",
        (locker_id, actor, action, detail),
    )
    conn.commit()
    conn.close()


def _archive_face_embedding(conn, rental_id: int):
    emb_row = conn.execute(
        "SELECT * FROM face_embeddings_active WHERE rental_id = ?",
        (rental_id,),
    ).fetchone()
    if emb_row:
        conn.execute(
            "INSERT INTO face_embeddings_history (rental_id, embedding) VALUES (?, ?)",
            (rental_id, emb_row["embedding"]),
        )
        conn.execute(
            "DELETE FROM face_embeddings_active WHERE rental_id = ?",
            (rental_id,),
        )


def _cancel_pending_rental_in_tx(conn, rental, actor: str, detail: str):
    rental_id = rental["id"]
    locker_id = rental["locker_id"]
    _archive_face_embedding(conn, rental_id)
    conn.execute(
        """
        UPDATE rentals
        SET status = 'CANCELLED',
            payment_status = 'CANCELLED',
            returned_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'RESERVED' AND payment_status = 'PENDING'
        """,
        (rental_id,),
    )
    conn.execute(
        "INSERT INTO action_logs (locker_id, actor, action, detail) VALUES (?, ?, ?, ?)",
        (locker_id, actor, "RESERVATION_CANCELLED", detail),
    )
    return locker_id


def cancel_pending_reservation(rental_id: int, actor: str = "customer", detail: str | None = None):
    conn = get_db()
    rental = conn.execute("SELECT * FROM rentals WHERE id = ?", (rental_id,)).fetchone()
    if rental is None:
        conn.close()
        return None

    if rental["status"] != "RESERVED" or rental["payment_status"] != "PENDING":
        data = rental_to_dict(rental)
        conn.close()
        return {"cancelled": False, "rental": data}

    log_detail = detail or f"Hủy phiên giữ chỗ #{rental_id}"
    locker_id = _cancel_pending_rental_in_tx(conn, rental, actor, log_detail)
    conn.commit()
    conn.close()

    from app.services.locker_service import update_locker_status

    update_locker_status(locker_id, "AVAILABLE")
    return {"cancelled": True, "rental_id": rental_id, "locker_id": locker_id}


def expire_pending_reservations():
    if RESERVATION_HOLD_SECONDS <= 0:
        return []

    now = datetime.datetime.now()
    conn = get_db()
    rows = conn.execute(
        """
        SELECT *
        FROM rentals
        WHERE status = 'RESERVED' AND payment_status = 'PENDING'
        ORDER BY id
        """
    ).fetchall()

    expired_locker_ids = []
    for rental in rows:
        start_time = parse_db_datetime(rental["start_time"])
        if start_time is None:
            continue
        age_seconds = int((now - start_time).total_seconds())
        if age_seconds < RESERVATION_HOLD_SECONDS:
            continue

        locker_id = _cancel_pending_rental_in_tx(
            conn,
            rental,
            "system",
            f"Tự hủy phiên giữ chỗ #{rental['id']} sau {RESERVATION_HOLD_SECONDS} giây chưa thanh toán",
        )
        expired_locker_ids.append(locker_id)

    conn.commit()
    conn.close()

    if expired_locker_ids:
        from app.services.locker_service import update_locker_status

        for locker_id in expired_locker_ids:
            update_locker_status(locker_id, "AVAILABLE")

    return expired_locker_ids


def get_active_rental_for_locker(conn, locker_id: int):
    return conn.execute(
        """
        SELECT * FROM rentals
        WHERE locker_id = ? AND status IN ('RESERVED','OCCUPIED','OVERTIME')
        ORDER BY id DESC
        LIMIT 1
        """,
        (locker_id,),
    ).fetchone()


def mask_phone(phone: str | None) -> str:
    if not phone:
        return ""
    if len(phone) <= 4:
        return phone
    return f"{phone[:3]}***{phone[-3:]}"
