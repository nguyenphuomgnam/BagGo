#include <WiFi.h>
#include <WiFiManager.h>
#include <PubSubClient.h>
#include <WebServer.h>
#include <WebSocketsServer.h>

// ================= 74HC595 =================
const int LATCH_595 = 5;
const int CLOCK_595 = 18;
const int DATA_595  = 23;
// ================= 74HC165 =================
const int LATCH_165 = 19;
const int CLOCK_165 = 4;
const int DATA_165  = 13;

// Output bits
const byte BIT_KHOA_MO = 0x01;
const byte BIT_LED_RED = 0x02;
const byte BIT_LED_GRN = 0x04;

// Cấu hình relay/feedback
const bool RELAY_ACTIVE_HIGH = true;
const int FEEDBACK_BIT = 0;
const bool FEEDBACK_HIGH_IS_LOCKED = true;

// Timing
const unsigned long UNLOCK_TIME_MS = 2000;
const unsigned long SENSOR_INTERVAL_MS = 100;
const unsigned long WS_SEND_INTERVAL_MS = 300;
const unsigned long SPAM_LOCK_MS = 5000;

// State
byte outputState = 0;
byte inputState = 0;
bool lockFeedback = true;
bool isUnlocking = false;
unsigned long unlockStartTime = 0;
unsigned long lastUnlockCommand = 0;
unsigned long lastSensorRead = 0;
unsigned long lastWsSend = 0;
unsigned long lastMqttPublish = 0;

// MQTT config
String mqtt_server = "192.168.1.100"; // sẽ được ghi đè qua WiFiManager
const int mqtt_port = 1883;
const char* mqtt_topic_open = "locker/1/open";
const char* mqtt_topic_close = "locker/1/close";
const char* mqtt_topic_led = "locker/1/led";
const char* mqtt_topic_status = "locker/1/status";

WiFiClient espClient;
PubSubClient mqttClient(espClient);
WebServer server(80);
WebSocketsServer webSocket(81);

// ================= HARDWARE FUNCTIONS =================
void ghi_595_raw(byte data) {
  outputState = data;
  digitalWrite(LATCH_595, LOW);
  shiftOut(DATA_595, CLOCK_595, MSBFIRST, outputState);
  digitalWrite(LATCH_595, HIGH);
}

void ghi_595(byte logicData) {
  byte realData = logicData;
  if (!RELAY_ACTIVE_HIGH) {
    if (logicData & BIT_KHOA_MO) realData &= ~BIT_KHOA_MO;
    else realData |= BIT_KHOA_MO;
  }
  ghi_595_raw(realData);
}

byte doc_165() {
  byte value = 0;
  digitalWrite(LATCH_165, LOW);
  delayMicroseconds(5);
  digitalWrite(LATCH_165, HIGH);
  delayMicroseconds(5);
  for (int i = 0; i < 8; i++) {
    int bitValue = digitalRead(DATA_165);
    value |= (bitValue << (7 - i));
    digitalWrite(CLOCK_165, HIGH);
    delayMicroseconds(5);
    digitalWrite(CLOCK_165, LOW);
    delayMicroseconds(5);
  }
  return value;
}

void updateSensor() {
  inputState = doc_165();
  bool rawFeedback = (inputState & (1 << FEEDBACK_BIT)) != 0;
  lockFeedback = FEEDBACK_HIGH_IS_LOCKED ? rawFeedback : !rawFeedback;
}

void updateOutputByState() {
  if (isUnlocking) {
    ghi_595(BIT_KHOA_MO | BIT_LED_GRN);
    return;
  }
  if (lockFeedback) ghi_595(BIT_LED_RED);
  else ghi_595(BIT_LED_GRN);
}

void openLock() {
  unsigned long now = millis();
  if (isUnlocking || (now - lastUnlockCommand < SPAM_LOCK_MS)) return;
  Serial.println(">> LENH MO KHOA");
  isUnlocking = true;
  unlockStartTime = now;
  lastUnlockCommand = now;
  updateOutputByState();
}

void closeLock() {
  if (!isUnlocking) return;
  Serial.println("<< TAT MO KHOA");
  isUnlocking = false;
  updateOutputByState();
}

// ================= MQTT CALLBACK =================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  Serial.printf("MQTT [%s]: %s\n", topic, msg.c_str());
  if (String(topic) == mqtt_topic_open) openLock();
  else if (String(topic) == mqtt_topic_close) closeLock();
  else if (String(topic) == mqtt_topic_led) {
    if (msg == "RED") ghi_595(BIT_LED_RED);
    else if (msg == "GREEN") ghi_595(BIT_LED_GRN);
    // Thêm các chế độ nháy (BLINK_RED,...) tùy theo logic
  }
}

void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("MQTT connecting...");
    if (mqttClient.connect("ESP32_Locker1")) {
      Serial.println("connected");
      mqttClient.subscribe(mqtt_topic_open);
      mqttClient.subscribe(mqtt_topic_close);
      mqttClient.subscribe(mqtt_topic_led);
    } else {
      Serial.print("failed, rc="); Serial.print(mqttClient.state());
      delay(2000);
    }
  }
}

void publishStatus() {
  String json = "{\"locked\":" + String(lockFeedback ? "true" : "false") +
                ",\"unlocking\":" + String(isUnlocking ? "true" : "false") + "}";
  mqttClient.publish(mqtt_topic_status, json.c_str());
}

// ================= WEBSOCKET (giữ lại để test nếu cần) =================
void sendStatusToWeb() {
  String json = "{";
  json += "\"locked\":" + String(lockFeedback ? "true" : "false") + ",";
  json += "\"unlocking\":" + String(isUnlocking ? "true" : "false") + ",";
  json += "\"input\":\"" + String(inputState, BIN) + "\"}";
  webSocket.broadcastTXT(json);
}

const char HTML_PAGE[] PROGMEM = R"rawliteral(
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Omni Locker</title></head>
<body><h1>ESP32 Test</h1><p>WebSocket connected: <span id="status">...</span></p><button onclick="openLock()">MỞ KHÓA</button>
<script>var socket=new WebSocket('ws://'+window.location.hostname+':81/');socket.onmessage=function(e){document.getElementById('status').innerText=e.data;};function openLock(){socket.send('OPEN_LOCK');}</script></body></html>)rawliteral";

void handleRoot() {
  server.send_P(200, "text/html", HTML_PAGE);
}

void webSocketEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t length) {
  if (type == WStype_CONNECTED) sendStatusToWeb();
  else if (type == WStype_TEXT) {
    if (strcmp((char*)payload, "OPEN_LOCK") == 0) openLock();
  }
}

// ================= SETUP =================
void setup() {
  Serial.begin(115200);

  pinMode(LATCH_595, OUTPUT); pinMode(CLOCK_595, OUTPUT); pinMode(DATA_595, OUTPUT);
  pinMode(LATCH_165, OUTPUT); pinMode(CLOCK_165, OUTPUT); pinMode(DATA_165, INPUT);
  digitalWrite(CLOCK_165, LOW); digitalWrite(LATCH_165, HIGH);
  ghi_595(BIT_LED_RED); // mặc định đỏ (AVAILABLE)

  // Kiểm tra nút FLASH (GPIO0) khi boot để reset cài đặt
  pinMode(0, INPUT_PULLUP);  // nút BOOT trên hầu hết các board ESP32 là GPIO0
  if (digitalRead(0) == LOW) {   // nút đang được nhấn (nối GND)
      Serial.println("Reset WiFi settings...");
      WiFiManager wm;
      wm.resetSettings();
      delay(3000);
      ESP.restart();
  }
  WiFiManager wm;
  WiFiManagerParameter custom_mqtt_server("server", "MQTT Server IP", mqtt_server.c_str(), 16);
  wm.addParameter(&custom_mqtt_server);
  wm.resetSettings();  // 👈 thêm dòng này
  bool res = wm.autoConnect("Tu_Locker_Thinh", "123456789");
  if (!res) {
    Serial.println("Failed to connect WiFi, restarting...");
    ESP.restart();
  }
  mqtt_server = custom_mqtt_server.getValue();
  Serial.println("WiFi connected! IP: " + WiFi.localIP().toString());
  Serial.println("MQTT Server: " + mqtt_server);

  mqttClient.setServer(mqtt_server.c_str(), mqtt_port);
  mqttClient.setCallback(mqttCallback);

  server.on("/", handleRoot);
  server.begin();
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
}

void loop() {
  if (!mqttClient.connected()) reconnectMQTT();
  mqttClient.loop();

  server.handleClient();
  webSocket.loop();

  unsigned long now = millis();
  if (now - lastSensorRead >= SENSOR_INTERVAL_MS) {
    lastSensorRead = now;
    updateSensor();
  }
  if (isUnlocking && (now - unlockStartTime >= UNLOCK_TIME_MS)) {
    closeLock();
  }
  updateOutputByState();

  if (now - lastWsSend >= WS_SEND_INTERVAL_MS) {
    lastWsSend = now;
    sendStatusToWeb();
  }
  if (now - lastMqttPublish >= 1000) {
    lastMqttPublish = now;
    publishStatus();
  }
}