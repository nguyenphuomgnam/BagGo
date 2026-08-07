import json
import logging
import os
import threading
import uuid

import paho.mqtt.client as mqtt

from app.database import get_db
from app.websocket_manager import manager


logger = logging.getLogger(__name__)

# The defaults match the demo firmware. For production, set all MQTT_* values
# on Railway and copy the same values into the ESP32 configuration block.
MQTT_BROKER = os.getenv("MQTT_BROKER", os.getenv("MQTT_HOST", "broker.emqx.io"))
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER", "").strip()
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "")
MQTT_TOPIC_PREFIX = os.getenv("MQTT_TOPIC_PREFIX", "baggo-7f3c91a2").strip().strip("/")
MQTT_TLS = os.getenv("MQTT_TLS", "true" if MQTT_PORT == 8883 else "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

_client = None
_connected = threading.Event()
_state_lock = threading.Lock()
_last_error = None
_started = False


def mqtt_topic(suffix: str) -> str:
    suffix = suffix.strip().strip("/")
    if MQTT_TOPIC_PREFIX:
        return f"{MQTT_TOPIC_PREFIX}/{suffix}"
    return suffix


def _set_error(message):
    global _last_error
    with _state_lock:
        _last_error = str(message) if message else None


def _parse_locker_topic(topic: str):
    prefix = f"{MQTT_TOPIC_PREFIX}/" if MQTT_TOPIC_PREFIX else ""
    if prefix and not topic.startswith(prefix):
        return None
    relative_topic = topic[len(prefix) :] if prefix else topic
    parts = relative_topic.split("/")
    if len(parts) != 3 or parts[0] != "locker":
        return None
    try:
        return int(parts[1]), parts[2]
    except ValueError:
        return None


def _broadcast_hardware(locker_id: int, **values):
    manager.broadcast_sync(
        json.dumps(
            {
                "type": "locker_hardware",
                "locker_id": locker_id,
                **values,
            }
        )
    )


def on_connect(client, userdata, flags, reason_code, properties=None):
    if reason_code != 0:
        _connected.clear()
        _set_error(f"Broker rejected connection: {reason_code}")
        logger.error("MQTT broker rejected connection: %s", reason_code)
        return

    _connected.set()
    _set_error(None)
    status_topic = mqtt_topic("locker/+/status")
    online_topic = mqtt_topic("locker/+/online")
    client.subscribe([(status_topic, 1), (online_topic, 1)])
    logger.info(
        "MQTT connected to %s:%s (TLS=%s); subscribed to %s and %s",
        MQTT_BROKER,
        MQTT_PORT,
        MQTT_TLS,
        status_topic,
        online_topic,
    )


def on_disconnect(client, userdata, disconnect_flags, reason_code, properties=None):
    _connected.clear()
    if reason_code != 0:
        _set_error(f"Disconnected: {reason_code}")
        logger.warning("MQTT disconnected unexpectedly (%s); reconnecting", reason_code)
    else:
        logger.info("MQTT disconnected")


def on_connect_fail(client, userdata):
    _connected.clear()
    _set_error("TCP connection failed")
    logger.warning("MQTT cannot reach %s:%s; retrying in background", MQTT_BROKER, MQTT_PORT)


def on_message(client, userdata, msg):
    parsed_topic = _parse_locker_topic(msg.topic)
    if parsed_topic is None:
        return

    locker_id, message_type = parsed_topic
    try:
        payload = msg.payload.decode("utf-8", errors="strict").strip()
        conn = get_db()
        try:
            if message_type == "online":
                online = payload.lower() == "online"
                conn.execute(
                    """
                    UPDATE lockers
                    SET hardware_online = ?, hardware_last_seen = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (1 if online else 0, locker_id),
                )
                conn.commit()
                _broadcast_hardware(locker_id, online=online)
                logger.info("Locker %s is %s", locker_id, "online" if online else "offline")
                return

            if message_type != "status":
                return

            data = json.loads(payload)
            locked = bool(data.get("locked"))
            unlocking = bool(data.get("unlocking"))
            conn.execute(
                """
                UPDATE lockers
                SET locked = ?, unlocking = ?, hardware_online = 1,
                    hardware_last_seen = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (1 if locked else 0, 1 if unlocking else 0, locker_id),
            )
            conn.commit()
            _broadcast_hardware(
                locker_id,
                online=True,
                locked=locked,
                unlocking=unlocking,
            )
            logger.info("Status from locker %s: %s", locker_id, payload)
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("MQTT message error for %s: %s", msg.topic, exc)


def start_mqtt():
    global _client, _started
    if _started:
        return _client

    client_id = f"baggo-backend-{os.getpid()}-{uuid.uuid4().hex[:8]}"
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=client_id,
        protocol=mqtt.MQTTv311,
    )
    if MQTT_USER:
        client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
    if MQTT_TLS:
        # Uses the operating system CA bundle and validates the broker hostname.
        client.tls_set()

    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_connect_fail = on_connect_fail
    client.on_message = on_message
    client.reconnect_delay_set(min_delay=1, max_delay=30)

    _client = client
    _started = True
    try:
        # Async connect keeps FastAPI available while DNS/network is recovering.
        client.connect_async(MQTT_BROKER, MQTT_PORT, keepalive=60)
        client.loop_start()
        logger.info(
            "MQTT client started for %s:%s (TLS=%s, prefix=%s)",
            MQTT_BROKER,
            MQTT_PORT,
            MQTT_TLS,
            MQTT_TOPIC_PREFIX or "<none>",
        )
    except Exception as exc:
        _set_error(exc)
        logger.exception("MQTT startup failed")
        _client = None
        _started = False
    return _client


def stop_mqtt():
    global _client, _started
    client = _client
    _connected.clear()
    if client is not None:
        try:
            client.disconnect()
            client.loop_stop()
        except Exception as exc:
            logger.warning("MQTT shutdown error: %s", exc)
    _client = None
    _started = False


def publish_message(topic_suffix: str, payload: str = "", qos: int = 1) -> bool:
    client = _client or start_mqtt()
    if client is None:
        return False

    # During a cold Railway start, give the background connection a short time
    # to establish before reporting that a hardware command could not be sent.
    if not _connected.wait(timeout=2.0):
        logger.warning("MQTT publish skipped while disconnected: %s", mqtt_topic(topic_suffix))
        return False

    topic = mqtt_topic(topic_suffix)
    info = client.publish(topic, payload, qos=qos, retain=False)
    if info.rc != mqtt.MQTT_ERR_SUCCESS:
        logger.warning("MQTT publish failed for %s (rc=%s)", topic, info.rc)
        return False
    try:
        info.wait_for_publish(timeout=2.0)
    except (RuntimeError, ValueError) as exc:
        logger.warning("MQTT broker acknowledgement failed for %s: %s", topic, exc)
        return False
    if qos > 0 and not info.is_published():
        logger.warning("MQTT broker did not acknowledge %s before timeout", topic)
        return False
    logger.info("MQTT command -> %s: %s", topic, payload or "<empty>")
    return True


def get_mqtt_status():
    with _state_lock:
        last_error = _last_error
    return {
        "connected": _connected.is_set(),
        "broker": MQTT_BROKER,
        "port": MQTT_PORT,
        "tls": MQTT_TLS,
        "authenticated": bool(MQTT_USER),
        "topic_prefix": MQTT_TOPIC_PREFIX,
        "last_error": last_error,
    }
