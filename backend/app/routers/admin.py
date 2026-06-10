from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.database import get_db
from app.services.locker_service import close_locker, open_locker, update_locker_status
from app.services.rental_service import expire_pending_reservations, get_active_rental_for_locker, log_action, rental_to_dict
from app.services.session_service import admin_password, create_admin_token, verify_admin_token

router = APIRouter()


class AdminLoginRequest(BaseModel):
    password: str = Field(min_length=1)


def _extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token


def require_admin(authorization: str | None = Header(default=None)):
    if not verify_admin_token(_extract_bearer_token(authorization)):
        raise HTTPException(401, "Admin token không hợp lệ")
    return True


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


@router.post("/admin/login")
def admin_login(payload: AdminLoginRequest):
    if payload.password != admin_password():
        raise HTTPException(401, "Mật khẩu admin không đúng")
    token = create_admin_token()
    log_action(None, "admin", "LOGIN", "Admin đăng nhập")
    return {"status": "ok", "token": token}


@router.post("/admin/open")
def admin_open(locker_id: int = 1, _: bool = Depends(require_admin)):
    conn = get_db()
    locker = conn.execute("SELECT * FROM lockers WHERE id = ?", (locker_id,)).fetchone()
    conn.close()
    if locker is None:
        raise HTTPException(404, "Không tìm thấy ngăn")

    update_locker_status(locker_id, "ADMIN_INTERVENTION")
    open_locker(locker_id)
    log_action(locker_id, "admin", "ADMIN_OPEN", "Admin mở khóa khẩn cấp")
    return {"status": "admin_open", "locker_id": locker_id}


@router.post("/admin/close")
def admin_close(locker_id: int = 1, _: bool = Depends(require_admin)):
    conn = get_db()
    locker = conn.execute("SELECT * FROM lockers WHERE id = ?", (locker_id,)).fetchone()
    if locker is None:
        conn.close()
        raise HTTPException(404, "Không tìm thấy ngăn")

    rental = get_active_rental_for_locker(conn, locker_id)
    restored_status = rental["status"] if rental else "AVAILABLE"
    conn.close()

    close_locker(locker_id)
    update_locker_status(locker_id, restored_status)
    log_action(locker_id, "admin", "ADMIN_CLOSE", f"Admin đóng khóa, trạng thái trả về {restored_status}")
    return {"status": "admin_close", "locker_id": locker_id, "locker_status": restored_status}


@router.post("/admin/force-return")
def force_return(locker_id: int = 1, _: bool = Depends(require_admin)):
    conn = get_db()
    rental = get_active_rental_for_locker(conn, locker_id)
    if rental is None:
        conn.close()
        raise HTTPException(400, "Không có phiên thuê đang hoạt động")

    rental_id = rental["id"]
    conn.execute(
        "UPDATE rentals SET status = 'COMPLETED', returned_at = CURRENT_TIMESTAMP WHERE id = ?",
        (rental_id,),
    )
    _archive_face_embedding(conn, rental_id)
    conn.commit()
    conn.close()

    open_locker(locker_id)
    update_locker_status(locker_id, "AVAILABLE")
    log_action(locker_id, "admin", "FORCE_RETURN", f"Admin giải phóng cưỡng chế phiên #{rental_id}")
    return {"status": "force_return", "rental_id": rental_id, "locker_id": locker_id}


@router.get("/admin/rentals")
def get_admin_rentals(_: bool = Depends(require_admin)):
    expire_pending_reservations()
    conn = get_db()
    rows = conn.execute(
        """
        SELECT
            r.*,
            l.name AS locker_name,
            CASE WHEN fa.rental_id IS NULL THEN 0 ELSE 1 END AS has_face
        FROM rentals r
        JOIN lockers l ON r.locker_id = l.id
        LEFT JOIN face_embeddings_active fa ON fa.rental_id = r.id
        ORDER BY r.id DESC
        """
    ).fetchall()
    conn.close()
    return [rental_to_dict(row) for row in rows]


@router.get("/admin/logs")
def get_admin_logs(_: bool = Depends(require_admin)):
    conn = get_db()
    rows = conn.execute("SELECT * FROM action_logs ORDER BY id DESC LIMIT 80").fetchall()
    conn.close()
    return [dict(row) for row in rows]


@router.get("/admin/stats")
def get_admin_stats(_: bool = Depends(require_admin)):
    expire_pending_reservations()
    conn = get_db()
    lockers = conn.execute("SELECT * FROM lockers").fetchall()
    total_revenue = conn.execute(
        "SELECT COALESCE(SUM(price), 0) FROM rentals WHERE payment_status = 'PAID'"
    ).fetchone()[0]
    today_revenue = conn.execute(
        """
        SELECT COALESCE(SUM(price), 0)
        FROM rentals
        WHERE payment_status = 'PAID' AND date(paid_at) = date('now', 'localtime')
        """
    ).fetchone()[0]
    total_sessions = conn.execute("SELECT COUNT(*) FROM rentals").fetchone()[0]
    active_sessions = conn.execute(
        "SELECT COUNT(*) FROM rentals WHERE status IN ('OCCUPIED','OVERTIME')"
    ).fetchone()[0]
    reserved_sessions = conn.execute(
        "SELECT COUNT(*) FROM rentals WHERE status = 'RESERVED'"
    ).fetchone()[0]
    overtime_sessions = conn.execute(
        """
        SELECT COUNT(*)
        FROM rentals
        WHERE status IN ('OCCUPIED','OVERTIME') AND end_time < CURRENT_TIMESTAMP
        """
    ).fetchone()[0]
    conn.close()

    available_lockers = len([locker for locker in lockers if locker["status"] == "AVAILABLE"])
    busy_lockers = len(lockers) - available_lockers
    return {
        "total_revenue": total_revenue,
        "today_revenue": today_revenue,
        "total_sessions": total_sessions,
        "active_sessions": active_sessions,
        "reserved_sessions": reserved_sessions,
        "overtime_sessions": overtime_sessions,
        "available_lockers": available_lockers,
        "busy_lockers": busy_lockers,
        "total_lockers": len(lockers),
        "utilization_rate": round((busy_lockers / len(lockers)) * 100) if lockers else 0,
    }
