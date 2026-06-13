import datetime
import math
import os
from typing import Any

from app.database import get_db


DEFAULT_SETTINGS = {
    "station_name": "Trạm MVP",
    "price_per_hour": 10000,
    "overtime_price_per_hour": 15000,
    "min_rental_hours": 1,
    "max_rental_hours": 24,
    "reservation_hold_seconds": int(os.getenv("RESERVATION_HOLD_SECONDS", "120")),
    "policy_terms": "1. Cam kết đến gửi đồ đúng giờ hẹn. Quá 15 phút phiên giữ chỗ sẽ bị hủy tự động.\n2. Không để các chất dễ cháy nổ, vũ khí, hóa chất độc hại vào tủ.\n3. Khách hàng tự chịu trách nhiệm bảo quản tài sản có giá trị cao như tiền mặt, vàng, trang sức.",
    "policy_regulations": "1. Mỗi lượt thuê tối thiểu là 1 giờ.\n2. Vui lòng đóng chặt cửa tủ sau khi gửi hoặc lấy hành lý.\n3. Nếu quá thời gian thuê đã đăng ký, phí quá hạn sẽ được tính theo bảng giá cấu hình.",
}


def _parse_datetime(value: Any):
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


def _coerce_int(value: Any, fallback: int, minimum: int | None = None):
    try:
        number = int(float(value))
    except (TypeError, ValueError):
        number = fallback
    if minimum is not None:
        number = max(minimum, number)
    return number


def get_app_settings(conn=None) -> dict:
    own_conn = conn is None
    if own_conn:
        conn = get_db()

    rows = conn.execute("SELECT key, value FROM app_settings").fetchall()
    values = {row["key"]: row["value"] for row in rows}

    if own_conn:
        conn.close()

    settings = {
        "station_name": values.get("station_name") or DEFAULT_SETTINGS["station_name"],
        "price_per_hour": _coerce_int(values.get("price_per_hour"), DEFAULT_SETTINGS["price_per_hour"], 0),
        "overtime_price_per_hour": _coerce_int(
            values.get("overtime_price_per_hour"),
            DEFAULT_SETTINGS["overtime_price_per_hour"],
            0,
        ),
        "min_rental_hours": _coerce_int(values.get("min_rental_hours"), DEFAULT_SETTINGS["min_rental_hours"], 1),
        "max_rental_hours": _coerce_int(values.get("max_rental_hours"), DEFAULT_SETTINGS["max_rental_hours"], 1),
        "reservation_hold_seconds": _coerce_int(
            values.get("reservation_hold_seconds"),
            DEFAULT_SETTINGS["reservation_hold_seconds"],
            0,
        ),
        "policy_terms": values.get("policy_terms") if values.get("policy_terms") is not None else DEFAULT_SETTINGS["policy_terms"],
        "policy_regulations": values.get("policy_regulations") if values.get("policy_regulations") is not None else DEFAULT_SETTINGS["policy_regulations"],
    }
    if settings["max_rental_hours"] < settings["min_rental_hours"]:
        settings["max_rental_hours"] = settings["min_rental_hours"]
    return settings


def save_app_settings(payload: dict) -> dict:
    current = get_app_settings()
    next_settings = {
        "station_name": str(payload.get("station_name") or current["station_name"]).strip() or DEFAULT_SETTINGS["station_name"],
        "price_per_hour": _coerce_int(payload.get("price_per_hour"), current["price_per_hour"], 0),
        "overtime_price_per_hour": _coerce_int(
            payload.get("overtime_price_per_hour"),
            current["overtime_price_per_hour"],
            0,
        ),
        "min_rental_hours": _coerce_int(payload.get("min_rental_hours"), current["min_rental_hours"], 1),
        "max_rental_hours": _coerce_int(payload.get("max_rental_hours"), current["max_rental_hours"], 1),
        "reservation_hold_seconds": _coerce_int(
            payload.get("reservation_hold_seconds"),
            current["reservation_hold_seconds"],
            0,
        ),
        "policy_terms": str(payload.get("policy_terms") if payload.get("policy_terms") is not None else current["policy_terms"]).strip(),
        "policy_regulations": str(payload.get("policy_regulations") if payload.get("policy_regulations") is not None else current["policy_regulations"]).strip(),
    }
    if next_settings["max_rental_hours"] < next_settings["min_rental_hours"]:
        next_settings["max_rental_hours"] = next_settings["min_rental_hours"]

    conn = get_db()
    for key, value in next_settings.items():
        conn.execute(
            """
            INSERT INTO app_settings (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
            """,
            (key, str(value)),
        )
    conn.commit()
    conn.close()
    return next_settings


def calculate_base_price(hours: int, settings: dict | None = None) -> int:
    settings = settings or get_app_settings()
    return int(hours) * int(settings["price_per_hour"])


def calculate_overtime_fee(rental: dict, settings: dict | None = None, at: datetime.datetime | None = None) -> dict:
    settings = settings or get_app_settings()
    at = at or datetime.datetime.now()

    status = rental.get("status")
    persisted_penalty = _coerce_int(rental.get("penalty"), 0, 0)
    if status not in ("OCCUPIED", "OVERTIME", "COMPLETED"):
        return {
            "overtime_hours": 0,
            "overtime_fee": persisted_penalty,
            "amount_due": 0,
        }

    if status == "COMPLETED" and persisted_penalty:
        hours = math.ceil(persisted_penalty / max(settings["overtime_price_per_hour"], 1))
        return {
            "overtime_hours": hours,
            "overtime_fee": persisted_penalty,
            "amount_due": 0,
        }

    end_dt = _parse_datetime(rental.get("end_time"))
    if end_dt is None:
        return {"overtime_hours": 0, "overtime_fee": persisted_penalty, "amount_due": persisted_penalty}

    effective_at = _parse_datetime(rental.get("returned_at")) if status == "COMPLETED" else at
    effective_at = effective_at or at
    overdue_seconds = int((effective_at - end_dt).total_seconds())
    if overdue_seconds <= 0:
        return {"overtime_hours": 0, "overtime_fee": persisted_penalty, "amount_due": 0}

    overtime_hours = max(1, math.ceil(overdue_seconds / 3600))
    fee = max(persisted_penalty, overtime_hours * int(settings["overtime_price_per_hour"]))
    amount_due = 0 if status == "COMPLETED" else max(0, fee - persisted_penalty)
    return {
        "overtime_hours": overtime_hours,
        "overtime_fee": fee,
        "amount_due": amount_due,
    }


def calculate_rental_amounts(rental: dict, settings: dict | None = None) -> dict:
    settings = settings or get_app_settings()
    base_price = _coerce_int(rental.get("price"), 0, 0)
    overtime = calculate_overtime_fee(rental, settings)
    return {
        "base_price": base_price,
        "overtime_hours": overtime["overtime_hours"],
        "overtime_fee": overtime["overtime_fee"],
        "amount_due": overtime["amount_due"],
        "total_due": base_price + overtime["overtime_fee"],
        "price_per_hour": settings["price_per_hour"],
        "overtime_price_per_hour": settings["overtime_price_per_hour"],
    }
