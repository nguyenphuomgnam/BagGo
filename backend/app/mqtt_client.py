import paho.mqtt.client as mqtt
import json
import asyncio
import threading
from app.websocket_manager import manager

MQTT_BROKER = "localhost"
MQTT_PORT = 1883

def on_connect(client, userdata, flags, rc):
    print("MQTT Connected to broker")
    client.subscribe("locker/+/status")

def on_message(client, userdata, msg):
    topic = msg.topic
    payload = msg.payload.decode()
    try:
        locker_id = int(topic.split('/')[1])
        data = json.loads(payload)
        print(f"Status from locker {locker_id}: {payload}")
        asyncio.run(manager.broadcast(json.dumps({
            "type": "locker_status",
            "locker_id": locker_id,
            "locked": data.get("locked"),
            "unlocking": data.get("unlocking")
        })))
    except Exception as e:
        print("MQTT on_message error:", e)

def start_mqtt():
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message
    try:
        client.connect(MQTT_BROKER, MQTT_PORT, 60)
        thread = threading.Thread(target=client.loop_forever, daemon=True)
        thread.start()
        print("MQTT Broker client loop started successfully.")
    except Exception as e:
        print(f"WARNING: Failed to connect to MQTT broker ({MQTT_BROKER}:{MQTT_PORT}). Running without MQTT support: {e}")
    return client