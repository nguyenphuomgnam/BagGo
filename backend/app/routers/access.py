import datetime
import pickle

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.database import get_db
from app.services.face_service import extract_embedding, identify_face
from app.services.locker_service import open_locker, update_locker_status
from app.services.rental_service import (
    ACTIVE_RENTAL_STATUSES,
    PRICE_PER_HOUR,
    RESERVATION_HOLD_SECONDS,
    cancel_pending_reservation,
    expire_pending_reservations,
    format_time_left,
    generate_access_code,
    log_action,
    parse_db_datetime,
    rental_to_dict,
)
from app.services.session_service import (
    create_customer_token,
    dev_otp_code,
    get_customer_phone,
)

router = APIRouter()


class PhoneRequest(BaseModel):
    phone: str = Field(min_length=6, max_length=20)


class VerifyOtpRequest(PhoneRequest):
    otp: str = Field(min_length=4, max_length=12)


class CustomerRentalAction(BaseModel):
    rental_id: int


class ExtendRentalRequest(CustomerRentalAction):
    hours: int = Field(default=1, ge=1, le=24)


def _normalize_phone(phone: str | None) -> str:
    if not phone:
        return ""
    return "".join(ch for ch in phone.strip() if ch.isdigit() or ch == "+")


def _extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token


def require_customer_phone(authorization: str | None = Header(default=None)) -> str:
    phone = get_customer_phone(_extract_bearer_token(authorization))
    if not phone:
        raise HTTPException(401, "Phiên đăng nhập đã hết hạn")
    return phone


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


def _load_owned_rental(conn, rental_id: int, phone: str):
    rental = conn.execute(
        "SELECT * FROM rentals WHERE id = ? AND phone = ?",
        (rental_id, phone),
    ).fetchone()
    if rental is None:
        conn.close()
        raise HTTPException(404, "Không tìm thấy phiên thuê của số điện thoại này")
    return rental


def _complete_rental(rental_id: int, actor: str, expected_phone: str | None = None):
    conn = get_db()
    if expected_phone:
        rental = _load_owned_rental(conn, rental_id, expected_phone)
    else:
        rental = conn.execute("SELECT * FROM rentals WHERE id = ?", (rental_id,)).fetchone()

    if rental is None or rental["status"] not in ("OCCUPIED", "OVERTIME"):
        conn.close()
        raise HTTPException(400, "Trạng thái thuê không hợp lệ")

    locker_id = rental["locker_id"]
    conn.execute(
        "UPDATE rentals SET status = 'COMPLETED', returned_at = CURRENT_TIMESTAMP WHERE id = ?",
        (rental_id,),
    )
    _archive_face_embedding(conn, rental_id)
    conn.commit()
    conn.close()

    open_locker(locker_id)
    update_locker_status(locker_id, "AVAILABLE")
    log_action(locker_id, actor, "RETURN", f"Kết thúc phiên thuê #{rental_id}")
    return {"status": "ok", "rental_id": rental_id, "locker_id": locker_id}


def _open_active_rental(rental_id: int, actor: str, expected_phone: str | None = None):
    conn = get_db()
    if expected_phone:
        rental = _load_owned_rental(conn, rental_id, expected_phone)
    else:
        rental = conn.execute("SELECT * FROM rentals WHERE id = ?", (rental_id,)).fetchone()

    if rental is None or rental["status"] not in ("OCCUPIED", "OVERTIME"):
        conn.close()
        raise HTTPException(400, "Không thể mở tạm thời")

    locker_id = rental["locker_id"]
    conn.close()
    open_locker(locker_id)
    log_action(locker_id, actor, "TEMP_OPEN", f"Mở tạm thời phiên thuê #{rental_id}")
    return {"status": "ok", "rental_id": rental_id, "locker_id": locker_id}


@router.post("/reserve")
def reserve_locker(locker_id: int = 1, hours: int = 2, phone: str = None):
    expire_pending_reservations()

    if hours < 1 or hours > 24:
        raise HTTPException(400, "Số giờ thuê phải từ 1 đến 24")

    normalized_phone = _normalize_phone(phone)
    if not normalized_phone:
        raise HTTPException(400, "Vui lòng nhập số điện thoại")

    conn = get_db()
    locker = conn.execute("SELECT * FROM lockers WHERE id = ?", (locker_id,)).fetchone()
    if locker is None or locker["status"] != "AVAILABLE":
        conn.close()
        raise HTTPException(400, "Ngăn không khả dụng")

    start_time = datetime.datetime.now()
    end_time = start_time + datetime.timedelta(hours=hours)
    access_code = generate_access_code()
    otp = dev_otp_code()
    conn.execute(
        """
        INSERT INTO rentals (
            locker_id, start_time, end_time, status, price, phone, access_code, otp_code, payment_status
        ) VALUES (?, ?, ?, 'RESERVED', ?, ?, ?, ?, 'PENDING')
        """,
        (locker_id, start_time, end_time, hours * PRICE_PER_HOUR, normalized_phone, access_code, otp),
    )
    rental_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()

    update_locker_status(locker_id, "RESERVED")
    log_action(locker_id, "customer", "RESERVE", f"Giữ chỗ phiên #{rental_id} trong {hours} giờ")
    return {
        "rental_id": rental_id,
        "locker_id": locker_id,
        "timeout": RESERVATION_HOLD_SECONDS,
        "access_code": access_code,
        "payment_status": "PENDING",
        "price": hours * PRICE_PER_HOUR,
    }


@router.post("/cancel-reservation")
def cancel_reservation(rental_id: int):
    result = cancel_pending_reservation(
        rental_id,
        "customer",
        f"Khách hủy phiên giữ chỗ #{rental_id} trước khi thanh toán",
    )
    if result is None:
        raise HTTPException(404, "Không tìm thấy phiên giữ chỗ")
    return result


@router.post("/upload-face/{rental_id}")
async def upload_face(rental_id: int, file: UploadFile = File(...)):
    expire_pending_reservations()
    contents = await file.read()
    embedding = extract_embedding(contents)
    if embedding is None:
        raise HTTPException(400, "Không tìm thấy khuôn mặt")

    conn = get_db()
    rental = conn.execute("SELECT * FROM rentals WHERE id = ?", (rental_id,)).fetchone()
    if rental is None or rental["status"] not in ACTIVE_RENTAL_STATUSES:
        conn.close()
        raise HTTPException(404, "Không tìm thấy phiên thuê hợp lệ")

    embedding_blob = pickle.dumps(embedding)
    conn.execute(
        "INSERT OR REPLACE INTO face_embeddings_active (rental_id, embedding) VALUES (?, ?)",
        (rental_id, embedding_blob),
    )
    conn.commit()
    conn.close()
    log_action(rental["locker_id"], "customer", "FACE_REGISTER", f"Đăng ký Face ID cho phiên #{rental_id}")
    return {"status": "ok"}


@router.post("/payment/callback")
def payment_callback(rental_id: int):
    expire_pending_reservations()
    conn = get_db()
    rental = conn.execute("SELECT * FROM rentals WHERE id = ?", (rental_id,)).fetchone()
    if rental is None or rental["status"] != "RESERVED":
        conn.close()
        raise HTTPException(400, "Giao dịch không hợp lệ")

    locker_id = rental["locker_id"]
    conn.execute(
        """
        UPDATE rentals
        SET status = 'OCCUPIED', payment_status = 'PAID', paid_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (rental_id,),
    )
    conn.commit()
    conn.close()

    update_locker_status(locker_id, "OCCUPIED")
    open_locker(locker_id)
    log_action(locker_id, "payment", "PAYMENT_PAID", f"Thanh toán thành công phiên #{rental_id}")
    return {"status": "ok", "rental_id": rental_id, "locker_id": locker_id}


@router.post("/identify")
async def identify(file: UploadFile = File(...)):
    contents = await file.read()
    embedding = extract_embedding(contents)
    if embedding is None:
        raise HTTPException(400, "Không tìm thấy khuôn mặt")

    rental_id = identify_face(embedding)
    if rental_id is None:
        raise HTTPException(401, "Khuôn mặt không khớp")

    conn = get_db()
    rental = conn.execute("SELECT * FROM rentals WHERE id = ?", (rental_id,)).fetchone()
    conn.close()
    if rental is None:
        raise HTTPException(404, "Không tìm thấy phiên thuê")

    payload = {
        "rental_id": rental_id,
        "locker_id": rental["locker_id"],
        "status": rental["status"],
    }
    payload.update(format_time_left(rental["end_time"]))
    log_action(rental["locker_id"], "customer", "FACE_IDENTIFY", f"Nhận diện thành công phiên #{rental_id}")
    return payload


@router.post("/temp-open")
def temp_open(rental_id: int):
    return _open_active_rental(rental_id, "customer")


@router.post("/return")
def return_locker(rental_id: int):
    return _complete_rental(rental_id, "customer")


@router.post("/customer/request-otp")
def request_customer_otp(payload: PhoneRequest):
    expire_pending_reservations()
    phone = _normalize_phone(payload.phone)
    otp = dev_otp_code()
    conn = get_db()
    rows = conn.execute(
        """
        SELECT * FROM rentals
        WHERE phone = ? AND status IN ('RESERVED','OCCUPIED','OVERTIME')
        ORDER BY id DESC
        """,
        (phone,),
    ).fetchall()
    if not rows:
        conn.close()
        raise HTTPException(404, "Không tìm thấy phiên thuê đang hoạt động")

    conn.execute(
        """
        UPDATE rentals SET otp_code = ?
        WHERE phone = ? AND status IN ('RESERVED','OCCUPIED','OVERTIME')
        """,
        (otp, phone),
    )
    conn.commit()
    conn.close()
    log_action(None, "customer", "OTP_REQUEST", f"Yêu cầu OTP cho số {phone}")
    return {"status": "ok", "phone": phone, "dev_otp": otp}


@router.post("/customer/verify-otp")
def verify_customer_otp(payload: VerifyOtpRequest):
    expire_pending_reservations()
    phone = _normalize_phone(payload.phone)
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
        WHERE r.phone = ? AND r.status IN ('RESERVED','OCCUPIED','OVERTIME')
        ORDER BY r.id DESC
        """,
        (phone,),
    ).fetchall()
    conn.close()
    if not rows:
        raise HTTPException(404, "Không tìm thấy phiên thuê đang hoạt động")

    valid_codes = {row["otp_code"] for row in rows if row["otp_code"]}
    valid_codes.add(dev_otp_code())
    if payload.otp not in valid_codes:
        raise HTTPException(401, "OTP không hợp lệ")

    token = create_customer_token(phone)
    log_action(None, "customer", "OTP_VERIFY", f"Đăng nhập bằng OTP cho số {phone}")
    return {
        "status": "ok",
        "token": token,
        "phone": phone,
        "rentals": [rental_to_dict(row) for row in rows],
    }


@router.get("/customer/rentals")
def get_customer_rentals(phone: str = Depends(require_customer_phone)):
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
        WHERE r.phone = ? AND r.status IN ('RESERVED','OCCUPIED','OVERTIME')
        ORDER BY r.id DESC
        """,
        (phone,),
    ).fetchall()
    conn.close()
    return [rental_to_dict(row) for row in rows]


@router.post("/customer/temp-open")
def customer_temp_open(
    payload: CustomerRentalAction,
    phone: str = Depends(require_customer_phone),
):
    return _open_active_rental(payload.rental_id, "customer", phone)


@router.post("/customer/return")
def customer_return(
    payload: CustomerRentalAction,
    phone: str = Depends(require_customer_phone),
):
    return _complete_rental(payload.rental_id, "customer", phone)


@router.post("/customer/extend")
def customer_extend(
    payload: ExtendRentalRequest,
    phone: str = Depends(require_customer_phone),
):
    conn = get_db()
    rental = _load_owned_rental(conn, payload.rental_id, phone)
    if rental["status"] not in ("OCCUPIED", "OVERTIME"):
        conn.close()
        raise HTTPException(400, "Chỉ có thể gia hạn phiên đang sử dụng")

    end_dt = parse_db_datetime(rental["end_time"]) or datetime.datetime.now()
    base_dt = max(end_dt, datetime.datetime.now())
    new_end = base_dt + datetime.timedelta(hours=payload.hours)
    added_price = payload.hours * PRICE_PER_HOUR
    conn.execute(
        """
        UPDATE rentals
        SET end_time = ?, price = COALESCE(price, 0) + ?, status = 'OCCUPIED'
        WHERE id = ?
        """,
        (new_end, added_price, payload.rental_id),
    )
    conn.commit()
    row = conn.execute(
        """
        SELECT r.*, l.name AS locker_name
        FROM rentals r
        JOIN lockers l ON r.locker_id = l.id
        WHERE r.id = ?
        """,
        (payload.rental_id,),
    ).fetchone()
    conn.close()
    update_locker_status(rental["locker_id"], "OCCUPIED")
    log_action(rental["locker_id"], "customer", "EXTEND", f"Gia hạn phiên #{payload.rental_id} thêm {payload.hours} giờ")
    return rental_to_dict(row)
