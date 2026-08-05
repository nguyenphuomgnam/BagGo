import paho.mqtt.publish as publish
from app.database import get_db
from app.websocket_manager import manager
from app.services.locker_state import LOCKER_LED_BY_STATUS
import json
import asyncio

import os

MQTT_HOST = os.getenv("MQTT_BROKER", os.getenv("MQTT_HOST", "localhost"))
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER", None)
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", None)

def _publish(topic: str, payload: str = ""):
    try:
        auth = None
        if MQTT_USER:
            auth = {'username': MQTT_USER, 'password': MQTT_PASSWORD}
        publish.single(topic, payload, hostname=MQTT_HOST, port=MQTT_PORT, auth=auth)
    except Exception as e:
        print(f"WARNING: MQTT publish failed for {topic}: {e}")

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

def open_locker(locker_id: int):
    _publish(f"locker/{locker_id}/open", "")

def close_locker(locker_id: int):
    _publish(f"locker/{locker_id}/close", "")

def blink_locker(locker_id: int):
    _publish(f"locker/{locker_id}/led", "BLINK_BOTH")
