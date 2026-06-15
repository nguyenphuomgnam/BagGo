from fastapi import APIRouter, Depends, Header, HTTPException, UploadFile, File
import shutil
import uuid
from pathlib import Path
from pydantic import BaseModel, Field

from app.database import get_db
from app.services.locker_service import close_locker, open_locker, update_locker_status
from app.services.rental_service import (
    expire_pending_reservations,
    get_active_rental_for_locker,
    log_action,
    rental_to_dict,
    sync_overtime_sessions,
)
from app.services.settings_service import calculate_overtime_fee, get_app_settings, save_app_settings
from app.services.session_service import admin_password, create_admin_token, verify_admin_token

router = APIRouter()


class AdminLoginRequest(BaseModel):
    password: str = Field(min_length=1)


class AdminSettingsRequest(BaseModel):
    station_name: str = Field(min_length=1, max_length=120)
    price_per_hour: int = Field(ge=0, le=1_000_000)
    overtime_price_per_hour: int = Field(ge=0, le=1_000_000)
    min_rental_hours: int = Field(ge=1, le=24)
    max_rental_hours: int = Field(ge=1, le=48)
    reservation_hold_seconds: int = Field(ge=0, le=86400)


class LockerCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    station_name: str = Field(default="Trạm MVP", max_length=120)


class StationCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    address: str = Field(default="", max_length=255)


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


def _sync_admin_state():
    expire_pending_reservations()
    sync_overtime_sessions()


def _build_overtime_alerts(conn):
    settings = get_app_settings(conn)
    rows = conn.execute(
        """
        SELECT
            r.*,
            l.name AS locker_name,
            l.station_name,
            CASE WHEN fa.rental_id IS NULL THEN 0 ELSE 1 END AS has_face
        FROM rentals r
        JOIN lockers l ON r.locker_id = l.id
        LEFT JOIN face_embeddings_active fa ON fa.rental_id = r.id
        WHERE r.status = 'OVERTIME'
        ORDER BY r.end_time ASC
        """
    ).fetchall()

    alerts = []
    for row in rows:
        rental = rental_to_dict(row)
        overtime = calculate_overtime_fee(rental, settings)
        alerts.append({
            "rental_id": rental["id"],
            "locker_id": rental["locker_id"],
            "locker_name": rental["locker_name"],
            "station_name": rental.get("station_name") or settings["station_name"],
            "phone": rental.get("phone"),
            "time_left": rental["time_left"],
            "overtime_hours": overtime["overtime_hours"],
            "overtime_fee": overtime["overtime_fee"],
            "amount_due": overtime["amount_due"],
            "price": rental.get("price", 0),
            "status_label": rental.get("status_label"),
            "status_hint": rental.get("status_hint"),
            "started_at": rental.get("start_time"),
            "ends_at": rental.get("end_time"),
        })
    return alerts


@router.post("/admin/login")
def admin_login(payload: AdminLoginRequest):
    if payload.password != admin_password():
        raise HTTPException(401, "Mật khẩu admin không đúng")
    token = create_admin_token()
    log_action(None, "admin", "LOGIN", "Admin đăng nhập")
    return {"status": "ok", "token": token}


@router.get("/admin/settings")
def get_admin_settings(_: bool = Depends(require_admin)):
    return get_app_settings()


@router.put("/admin/settings")
def update_admin_settings(payload: AdminSettingsRequest, _: bool = Depends(require_admin)):
    settings = save_app_settings(payload.model_dump())
    log_action(None, "admin", "SETTINGS_UPDATE", f"Cập nhật cấu hình giá {settings['price_per_hour']}đ/h và quá hạn {settings['overtime_price_per_hour']}đ/h")
    return settings


@router.post("/admin/lockers")
def create_locker(payload: LockerCreateRequest, _: bool = Depends(require_admin)):
    conn = get_db()
    row = conn.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM lockers").fetchone()
    locker_id = row["next_id"]
    conn.execute(
        """
        INSERT INTO lockers (id, name, status, station_name, is_active)
        VALUES (?, ?, 'AVAILABLE', ?, 1)
        """,
        (locker_id, payload.name.strip(), payload.station_name.strip() or "Trạm MVP"),
    )
    conn.commit()
    conn.close()
    update_locker_status(locker_id, "AVAILABLE")
    log_action(locker_id, "admin", "LOCKER_CREATE", f"Thêm tủ {payload.name} tại {payload.station_name}")
    return {"status": "ok", "locker_id": locker_id, "name": payload.name, "station_name": payload.station_name}


@router.delete("/admin/lockers/{locker_id}")
def delete_locker(locker_id: int, _: bool = Depends(require_admin)):
    conn = get_db()
    locker = conn.execute("SELECT * FROM lockers WHERE id = ?", (locker_id,)).fetchone()
    if locker is None:
        conn.close()
        raise HTTPException(404, "Không tìm thấy ngăn")
    active = conn.execute(
        "SELECT COUNT(*) FROM rentals WHERE locker_id = ? AND status IN ('RESERVED','OCCUPIED','OVERTIME')",
        (locker_id,),
    ).fetchone()[0]
    if active:
        conn.close()
        raise HTTPException(400, "Không thể bớt tủ khi đang có phiên thuê hoặc giữ chỗ")

    conn.execute("UPDATE lockers SET is_active = 0, status = 'AVAILABLE', last_updated = CURRENT_TIMESTAMP WHERE id = ?", (locker_id,))
    conn.commit()
    conn.close()
    update_locker_status(locker_id, "AVAILABLE")
    log_action(locker_id, "admin", "LOCKER_REMOVE", f"Ẩn tủ {locker['name']}")
    return {"status": "ok", "locker_id": locker_id}


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
        locker = conn.execute("SELECT * FROM lockers WHERE id = ?", (locker_id,)).fetchone()
        if locker is None:
            conn.close()
            raise HTTPException(404, "Không tìm thấy ngăn")
        if locker["status"] == "AVAILABLE":
            conn.close()
            raise HTTPException(400, "Ngăn tủ đã ở trạng thái trống")

        conn.close()
        open_locker(locker_id)
        update_locker_status(locker_id, "AVAILABLE")
        log_action(locker_id, "admin", "FORCE_RETURN", "Admin giải phóng cưỡng chế ngăn tủ (không có phiên thuê)")
        return {"status": "force_return", "rental_id": None, "locker_id": locker_id, "overtime_fee": 0}

    rental_id = rental["id"]
    settings = get_app_settings(conn)
    overtime_fee = calculate_overtime_fee(dict(rental), settings)["overtime_fee"]
    conn.execute(
        """
        UPDATE rentals
        SET status = 'COMPLETED',
            penalty = ?,
            returned_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (overtime_fee, rental_id),
    )
    _archive_face_embedding(conn, rental_id)
    conn.commit()
    conn.close()

    open_locker(locker_id)
    update_locker_status(locker_id, "AVAILABLE")
    log_action(locker_id, "admin", "FORCE_RETURN", f"Admin giải phóng cưỡng chế phiên #{rental_id}, phí quá hạn {overtime_fee}đ")
    return {"status": "force_return", "rental_id": rental_id, "locker_id": locker_id, "overtime_fee": overtime_fee}


@router.get("/admin/rentals")
def get_admin_rentals(
    page: int = 1,
    limit: int = 20,
    status: str = "all",
    search: str = "",
    _: bool = Depends(require_admin)
):
    import math
    _sync_admin_state()
    if page < 1:
        page = 1
    if limit < 1 or limit > 100:
        limit = 20
    offset = (page - 1) * limit

    conn = get_db()
    where_clauses = []
    params = []

    if status == "active":
        where_clauses.append("r.status IN ('RESERVED', 'OCCUPIED', 'OVERTIME')")
    elif status == "overtime":
        where_clauses.append("r.status = 'OVERTIME'")
    elif status == "completed":
        where_clauses.append("r.status = 'COMPLETED'")
    elif status == "cancelled":
        where_clauses.append("r.status = 'CANCELLED'")

    if search:
        search_kw = f"%{search.strip().lower()}%"
        where_clauses.append("(CAST(r.id AS TEXT) LIKE ? OR r.phone LIKE ? OR l.name LIKE ? OR l.station_name LIKE ?)")
        params.extend([search_kw, search_kw, search_kw, search_kw])

    where_sql = ""
    if where_clauses:
        where_sql = "WHERE " + " AND ".join(where_clauses)

    count_sql = f"""
        SELECT COUNT(*)
        FROM rentals r
        JOIN lockers l ON r.locker_id = l.id
        {where_sql}
    """
    total = conn.execute(count_sql, params).fetchone()[0]

    fetch_sql = f"""
        SELECT
            r.*,
            l.name AS locker_name,
            l.station_name,
            CASE WHEN fa.rental_id IS NULL THEN 0 ELSE 1 END AS has_face
        FROM rentals r
        JOIN lockers l ON r.locker_id = l.id
        LEFT JOIN face_embeddings_active fa ON fa.rental_id = r.id
        {where_sql}
        ORDER BY r.id DESC
        LIMIT ? OFFSET ?
    """
    fetch_params = params + [limit, offset]
    rows = conn.execute(fetch_sql, fetch_params).fetchall()
    conn.close()

    pages = math.ceil(total / limit) if limit > 0 else 1

    return {
        "items": [rental_to_dict(row) for row in rows],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": pages
    }


@router.get("/admin/rentals/{rental_id}")
def get_admin_rental(rental_id: int, _: bool = Depends(require_admin)):
    _sync_admin_state()
    conn = get_db()
    row = conn.execute(
        """
        SELECT
            r.*,
            l.name AS locker_name,
            l.station_name,
            CASE WHEN fa.rental_id IS NULL THEN 0 ELSE 1 END AS has_face
        FROM rentals r
        JOIN lockers l ON r.locker_id = l.id
        LEFT JOIN face_embeddings_active fa ON fa.rental_id = r.id
        WHERE r.id = ?
        """,
        (rental_id,)
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Không tìm thấy phiên thuê")
    return rental_to_dict(row)


@router.get("/admin/logs")
def get_admin_logs(page: int = 1, limit: int = 20, _: bool = Depends(require_admin)):
    import math
    _sync_admin_state()
    if page < 1:
        page = 1
    if limit < 1 or limit > 100:
        limit = 20
    offset = (page - 1) * limit

    conn = get_db()
    total = conn.execute("SELECT COUNT(*) FROM action_logs").fetchone()[0]

    rows = conn.execute(
        "SELECT * FROM action_logs ORDER BY id DESC LIMIT ? OFFSET ?",
        (limit, offset)
    ).fetchall()
    conn.close()

    pages = math.ceil(total / limit) if limit > 0 else 1

    return {
        "items": [dict(row) for row in rows],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": pages
    }


@router.get("/admin/stats")
def get_admin_stats(_: bool = Depends(require_admin)):
    _sync_admin_state()
    conn = get_db()
    lockers = conn.execute("SELECT * FROM lockers WHERE COALESCE(is_active, 1) = 1").fetchall()
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
        "SELECT COUNT(*) FROM rentals WHERE status = 'OVERTIME'"
    ).fetchone()[0]
    alerts = _build_overtime_alerts(conn)
    history_rows = conn.execute(
        """
        SELECT 
            date(COALESCE(start_time, 'now')) AS day,
            COUNT(*) AS bookings,
            SUM(CASE WHEN payment_status = 'PAID' THEN price ELSE 0 END) AS revenue
        FROM rentals
        GROUP BY day
        ORDER BY day ASC
        LIMIT 14
        """
    ).fetchall()
    history = [
        {
            "day": row["day"],
            "bookings": row["bookings"],
            "revenue": row["revenue"] or 0
        }
        for row in history_rows
    ]
    conn.close()

    available_lockers = len([locker for locker in lockers if locker["status"] == "AVAILABLE"])
    busy_lockers = len(lockers) - available_lockers
    overtime_due = sum(alert["amount_due"] for alert in alerts)
    return {
        "total_revenue": total_revenue,
        "today_revenue": today_revenue,
        "overtime_due": overtime_due,
        "total_sessions": total_sessions,
        "active_sessions": active_sessions,
        "reserved_sessions": reserved_sessions,
        "overtime_sessions": overtime_sessions,
        "available_lockers": available_lockers,
        "busy_lockers": busy_lockers,
        "utilization_rate": round((busy_lockers / len(lockers)) * 100) if lockers else 0,
        "alerts": alerts,
        "history": history,
    }


@router.post("/admin/stations", dependencies=[Depends(require_admin)])
def create_station(payload: StationCreateRequest):
    conn = get_db()
    try:
        conn.execute(
            """
            INSERT INTO stations (name, latitude, longitude, address)
            VALUES (?, ?, ?, ?)
            """,
            (payload.name.strip(), payload.latitude, payload.longitude, payload.address.strip())
        )
        conn.commit()
    except Exception as e:
        conn.close()
        raise HTTPException(400, f"Trạm đã tồn tại hoặc dữ liệu không hợp lệ: {str(e)}")
    
    row = conn.execute("SELECT * FROM stations WHERE name = ?", (payload.name.strip(),)).fetchone()
    conn.close()
    return dict(row)


@router.put("/admin/stations/{station_id}", dependencies=[Depends(require_admin)])
def update_station(station_id: int, payload: StationCreateRequest):
    conn = get_db()
    station = conn.execute("SELECT * FROM stations WHERE id = ?", (station_id,)).fetchone()
    if not station:
        conn.close()
        raise HTTPException(404, "Không tìm thấy trạm")
    
    # Kiểm tra trùng tên trạm khác
    existing = conn.execute("SELECT * FROM stations WHERE name = ? AND id != ?", (payload.name.strip(), station_id)).fetchone()
    if existing:
        conn.close()
        raise HTTPException(400, "Tên trạm đã tồn tại")
    
    conn.execute(
        """
        UPDATE stations
        SET name = ?, latitude = ?, longitude = ?, address = ?
        WHERE id = ?
        """,
        (payload.name.strip(), payload.latitude, payload.longitude, payload.address.strip(), station_id)
    )
    # Cập nhật cả tên trạm trong lockers
    conn.execute(
        "UPDATE lockers SET station_name = ? WHERE station_name = ?",
        (payload.name.strip(), station["name"])
    )
    conn.commit()
    row = conn.execute("SELECT * FROM stations WHERE id = ?", (station_id,)).fetchone()
    conn.close()
    return dict(row)


@router.delete("/admin/stations/{station_id}", dependencies=[Depends(require_admin)])
def delete_station(station_id: int):
    conn = get_db()
    station = conn.execute("SELECT * FROM stations WHERE id = ?", (station_id,)).fetchone()
    if not station:
        conn.close()
        raise HTTPException(404, "Không tìm thấy trạm")
    
    # Kiểm tra xem các tủ thuộc trạm này có đang trong phiên thuê nào hoạt động không
    active_rentals = conn.execute("""
        SELECT COUNT(*) FROM rentals r
        JOIN lockers l ON r.locker_id = l.id
        WHERE l.station_name = ? AND r.status IN ('RESERVED', 'RENTED', 'OVERTIME')
    """, (station["name"],)).fetchone()[0]
    
    if active_rentals > 0:
        conn.close()
        raise HTTPException(400, "Không thể xóa trạm vì đang có ngăn tủ đang được sử dụng hoặc đặt trước tại trạm này")
        
    # Tự động xóa các ngăn tủ thuộc trạm này nếu không có phiên thuê hoạt động
    conn.execute("DELETE FROM lockers WHERE station_name = ?", (station["name"],))
    
    conn.execute("DELETE FROM stations WHERE id = ?", (station_id,))
    conn.commit()
    conn.close()
    return {"status": "ok", "deleted_station_id": station_id}



class AdvertisementCreateRequest(BaseModel):
    position: str = Field(min_length=1, max_length=50)
    text: str = Field(min_length=1, max_length=500)
    link_url: str | None = Field(default=None)
    image_url: str | None = Field(default=None)
    priority: int = Field(default=1, ge=1)
    is_active: int = Field(default=1, ge=0, le=1)


@router.get("/admin/ads", dependencies=[Depends(require_admin)])
def admin_get_ads():
    conn = get_db()
    rows = conn.execute("SELECT * FROM advertisements ORDER BY priority DESC, id DESC").fetchall()
    conn.close()
    return [dict(row) for row in rows]


@router.post("/admin/ads", dependencies=[Depends(require_admin)])
def admin_create_ad(payload: AdvertisementCreateRequest):
    conn = get_db()
    cursor = conn.execute(
        """
        INSERT INTO advertisements (position, text, link_url, image_url, priority, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            payload.position.strip(),
            payload.text.strip(),
            payload.link_url.strip() if payload.link_url else None,
            payload.image_url.strip() if payload.image_url else None,
            payload.priority,
            payload.is_active,
        ),
    )
    ad_id = cursor.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM advertisements WHERE id = ?", (ad_id,)).fetchone()
    conn.close()
    return dict(row)


@router.put("/admin/ads/{ad_id}", dependencies=[Depends(require_admin)])
def admin_update_ad(ad_id: int, payload: AdvertisementCreateRequest):
    conn = get_db()
    ad = conn.execute("SELECT * FROM advertisements WHERE id = ?", (ad_id,)).fetchone()
    if not ad:
        conn.close()
        raise HTTPException(404, "Không tìm thấy quảng cáo")
    conn.execute(
        """
        UPDATE advertisements
        SET position = ?, text = ?, link_url = ?, image_url = ?, priority = ?, is_active = ?
        WHERE id = ?
        """,
        (
            payload.position.strip(),
            payload.text.strip(),
            payload.link_url.strip() if payload.link_url else None,
            payload.image_url.strip() if payload.image_url else None,
            payload.priority,
            payload.is_active,
            ad_id,
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM advertisements WHERE id = ?", (ad_id,)).fetchone()
    conn.close()
    return dict(row)


@router.delete("/admin/ads/{ad_id}", dependencies=[Depends(require_admin)])
def admin_delete_ad(ad_id: int):
    conn = get_db()
    ad = conn.execute("SELECT * FROM advertisements WHERE id = ?", (ad_id,)).fetchone()
    if not ad:
        conn.close()
        raise HTTPException(404, "Không tìm thấy quảng cáo")
    conn.execute("DELETE FROM advertisements WHERE id = ?", (ad_id,))
    conn.commit()
    conn.close()
    return {"status": "ok", "deleted_ad_id": ad_id}


@router.post("/admin/upload-ad-image")
async def upload_ad_image(file: UploadFile = File(...), _: bool = Depends(require_admin)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Chỉ chấp nhận file ảnh")
    
    upload_dir = Path(__file__).resolve().parents[2] / "static" / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    ext = Path(file.filename).suffix or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = upload_dir / filename
    
    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(500, f"Không thể lưu file: {str(e)}")
        
    return {"url": f"/uploads/{filename}"}

