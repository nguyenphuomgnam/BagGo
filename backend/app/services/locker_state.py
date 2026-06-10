LOCKER_STATUS_META = {
    "AVAILABLE": {
        "label": "Trống",
        "hint": "Sẵn sàng nhận hành lý",
        "led": "GREEN",
    },
    "RESERVED": {
        "label": "Giữ chỗ",
        "hint": "Đã có phiên đặt trước",
        "led": "BLINK_GREEN",
    },
    "REGISTERING": {
        "label": "Đang đăng ký",
        "hint": "Chưa hoàn tất xác thực",
        "led": "BLINK_GREEN",
    },
    "AWAITING_PAYMENT": {
        "label": "Chờ thanh toán",
        "hint": "Đã xác thực, chưa mở tủ",
        "led": "BLINK_GREEN",
    },
    "OCCUPIED": {
        "label": "Đang dùng",
        "hint": "Cần xác thực để mở",
        "led": "RED",
    },
    "OVERTIME": {
        "label": "Quá giờ",
        "hint": "Phiên đã hết hạn",
        "led": "BLINK_RED",
    },
    "ADMIN_INTERVENTION": {
        "label": "Can thiệp",
        "hint": "Tạm khóa bởi admin",
        "led": "BLINK_BOTH",
    },
    "COMPLETED": {
        "label": "Hoàn tất",
        "hint": "Phiên đã kết thúc",
        "led": "RED",
    },
    "CANCELLED": {
        "label": "Đã hủy",
        "hint": "Phiên đăng ký đã bị hủy",
        "led": "GREEN",
    },
}


def get_locker_status_meta(status: str | None):
    return LOCKER_STATUS_META.get(status, LOCKER_STATUS_META["ADMIN_INTERVENTION"])


def _display_status(data):
    status = data.get("status")
    payment_status = data.get("payment_status") or data.get("active_rental_payment_status")
    has_face = data.get("has_face", data.get("active_rental_has_face", 0))

    if status == "RESERVED" and payment_status == "PENDING":
        if has_face:
            return "AWAITING_PAYMENT"
        return "REGISTERING"

    return status


def decorate_locker_row(row):
    data = dict(row)
    stage = _display_status(data)
    if stage == data.get("status"):
        stage = None
    meta = get_locker_status_meta(stage or data.get("status"))
    data["status_label"] = meta["label"]
    data["status_hint"] = meta["hint"]
    data["reservation_stage"] = stage
    return data


def decorate_rental_row(row):
    data = dict(row)
    stage = _display_status(data)
    meta = get_locker_status_meta(stage)
    data["status_label"] = meta["label"]
    data["status_hint"] = meta["hint"]
    data["reservation_stage"] = stage if stage != data.get("status") else None
    return data


LOCKER_LED_BY_STATUS = {
    status: meta["led"] for status, meta in LOCKER_STATUS_META.items()
    if status not in {"REGISTERING", "AWAITING_PAYMENT", "CANCELLED"}
}
