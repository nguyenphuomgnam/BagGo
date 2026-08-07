import json

from app.database import get_db
from app.mqtt_client import publish_message
from app.services.locker_state import LOCKER_LED_BY_STATUS
from app.websocket_manager import manager


def _publish(topic: str, payload: str = "") -> bool:
    return publish_message(topic, payload, qos=1)


def update_locker_status(locker_id: int, new_status: str):
    conn = get_db()
    conn.execute(
        "UPDATE lockers SET status = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?",
        (new_status, locker_id),
    )
    conn.commit()
    conn.close()

    led_mode = LOCKER_LED_BY_STATUS.get(new_status, "RED")
    _publish(f"locker/{locker_id}/led", led_mode)

    manager.broadcast_sync(json.dumps({
        "type": "locker_update",
        "locker_id": locker_id,
        "status": new_status
    }))


def open_locker(locker_id: int) -> bool:
    return _publish(f"locker/{locker_id}/open", "OPEN")


def close_locker(locker_id: int) -> bool:
    return _publish(f"locker/{locker_id}/close", "CLOSE")


def blink_locker(locker_id: int) -> bool:
    return _publish(f"locker/{locker_id}/led", "BLINK_BOTH")
