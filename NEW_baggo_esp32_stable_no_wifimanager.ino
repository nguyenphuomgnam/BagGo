#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

// ============================================================
// BAGGO ESP32 - STABLE DEMO VERSION
// No WiFiManager. Direct WiFi connection to avoid saved-AP crash.
// ============================================================

// ---------- EDIT THESE TWO LINES ----------
const char* WIFI_SSID     = "FPT Telecom 6868";
const char* WIFI_PASSWORD = "@12341234";
// -----------------------------------------

const int LOCKER_ID = 1;

// 74HC595
const int LATCH_595 = 5;
const int CLOCK_595 = 18;
const int DATA_595  = 23;

// 74HC165
const int LATCH_165 = 19;
const int CLOCK_165 = 4;
const int DATA_165  = 13;

// Outputs
const byte BIT_KHOA_MO = 0x01;
const byte BIT_LED_RED  = 0x02;
const byte BIT_LED_GRN  = 0x04;

const bool RELAY_ACTIVE_HIGH = true;
const int FEEDBACK_BIT = 0;
const bool FEEDBACK_HIGH_IS_LOCKED = true;

const unsigned long UNLOCK_TIME_MS     = 2000;
const unsigned long SENSOR_INTERVAL_MS = 100;
const unsigned long STATUS_INTERVAL_MS = 1000;
const unsigned long MQTT_RETRY_MS      = 3000;
const unsigned long WIFI_RETRY_MS      = 5000;
const unsigned long SPAM_LOCK_MS       = 5000;
const unsigned long BLINK_INTERVAL_MS  = 300;
const unsigned long BLINK_DURATION_MS  = 10000;

// MQTT -------------------------------------------------------
// These values must match the MQTT_* variables on Railway.
// The public EMQX broker is suitable for a connection test only. For a real
// deployment, use a private broker account, TLS port 8883 and a unique prefix.
const char* MQTT_BROKER = "broker.emqx.io";
const uint16_t MQTT_PORT = 1883;
const bool MQTT_USE_TLS = false;
const char* MQTT_USER = "";
const char* MQTT_PASSWORD = "";
const char* MQTT_TOPIC_PREFIX = "baggo-7f3c91a2";

WiFiClient plainMqttClient;
WiFiClientSecure secureMqttClient;
PubSubClient mqttClient;

String topicOpen;
String topicClose;
String topicLed;
String topicStatus;
String topicOnline;

byte outputState = 0;
byte inputState = 0;

bool lockFeedback = true;
bool isUnlocking = false;

unsigned long unlockStartTime = 0;
unsigned long lastUnlockCommand = 0;
unsigned long lastSensorRead = 0;
unsigned long lastStatusPublish = 0;
unsigned long lastMqttAttempt = 0;
unsigned long lastWifiAttempt = 0;

enum LedMode {
  LED_RED_MODE,
  LED_GREEN_MODE
};

LedMode ledMode = LED_RED_MODE;
bool blinkActive = false;
bool blinkPhase = false;
unsigned long blinkUntil = 0;
unsigned long lastBlinkToggle = 0;

String buildMqttTopic(const String& suffix) {
  String prefix = String(MQTT_TOPIC_PREFIX);
  prefix.trim();
  while (prefix.endsWith("/")) prefix.remove(prefix.length() - 1);
  while (prefix.startsWith("/")) prefix.remove(0, 1);
  return prefix.length() > 0 ? prefix + "/" + suffix : suffix;
}

// ============================================================
// 74HC595
// ============================================================
void write595Raw(byte data) {
  outputState = data;
  digitalWrite(LATCH_595, LOW);
  shiftOut(DATA_595, CLOCK_595, MSBFIRST, outputState);
  digitalWrite(LATCH_595, HIGH);
}

void write595(byte logicData) {
  byte realData = logicData;

  if (!RELAY_ACTIVE_HIGH) {
    if (logicData & BIT_KHOA_MO) realData &= ~BIT_KHOA_MO;
    else realData |= BIT_KHOA_MO;
  }

  write595Raw(realData);
}

// ============================================================
// 74HC165
// ============================================================
byte read165() {
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
  inputState = read165();
  bool rawFeedback = (inputState & (1 << FEEDBACK_BIT)) != 0;
  lockFeedback = FEEDBACK_HIGH_IS_LOCKED ? rawFeedback : !rawFeedback;
}

// ============================================================
// OUTPUTS
// ============================================================
void applyOutputs() {
  byte data = 0;

  if (isUnlocking) data |= BIT_KHOA_MO;

  if (isUnlocking) {
    data |= BIT_LED_GRN;
  } else if (blinkActive) {
    data |= blinkPhase ? BIT_LED_RED : BIT_LED_GRN;
  } else {
    data |= (ledMode == LED_RED_MODE) ? BIT_LED_RED : BIT_LED_GRN;
  }

  write595(data);
}

void startBlinkBoth() {
  blinkActive = true;
  blinkPhase = false;
  blinkUntil = millis() + BLINK_DURATION_MS;
  lastBlinkToggle = 0;
  Serial.println("LED: BLINK_BOTH");
  applyOutputs();
}

void handleBlink() {
  if (!blinkActive) return;

  unsigned long now = millis();

  if ((long)(now - blinkUntil) >= 0) {
    blinkActive = false;
    Serial.println("LED: blink finished");
    applyOutputs();
    return;
  }

  if (now - lastBlinkToggle >= BLINK_INTERVAL_MS) {
    lastBlinkToggle = now;
    blinkPhase = !blinkPhase;
    applyOutputs();
  }
}

// ============================================================
// MQTT STATUS
// ============================================================
void publishStatus() {
  if (!mqttClient.connected()) return;

  String json =
    "{\"locked\":" + String(lockFeedback ? "true" : "false") +
    ",\"unlocking\":" + String(isUnlocking ? "true" : "false") + "}";

  mqttClient.publish(topicStatus.c_str(), json.c_str(), true);
  Serial.print("STATUS -> ");
  Serial.println(json);
}

// ============================================================
// LOCK
// ============================================================
void closeLock();

void openLock() {
  unsigned long now = millis();

  if (isUnlocking) {
    Serial.println("OPEN ignored: already unlocking");
    return;
  }

  if (lastUnlockCommand != 0 && now - lastUnlockCommand < SPAM_LOCK_MS) {
    Serial.println("OPEN ignored: anti-spam");
    return;
  }

  Serial.println(">> LENH MO KHOA");

  isUnlocking = true;
  unlockStartTime = now;
  lastUnlockCommand = now;

  applyOutputs();
  publishStatus();
}

void closeLock() {
  if (!isUnlocking) return;

  Serial.println("<< TAT MO KHOA");
  isUnlocking = false;

  applyOutputs();
  publishStatus();
}

// ============================================================
// MQTT CALLBACK
// ============================================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg;

  for (unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }
  msg.trim();

  String currentTopic(topic);

  Serial.print("MQTT [");
  Serial.print(currentTopic);
  Serial.print("] ");
  Serial.println(msg);

  if (currentTopic == topicOpen) {
    openLock();
  }
  else if (currentTopic == topicClose) {
    closeLock();
  }
  else if (currentTopic == topicLed) {
    if (msg == "RED") {
      blinkActive = false;
      ledMode = LED_RED_MODE;
      applyOutputs();
    }
    else if (msg == "GREEN") {
      blinkActive = false;
      ledMode = LED_GREEN_MODE;
      applyOutputs();
    }
    else if (msg == "BLINK_BOTH") {
      startBlinkBoth();
    }
  }
}

// ============================================================
// WIFI
// ============================================================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.println();
  Serial.print("Connecting WiFi: ");
  Serial.println(WIFI_SSID);

  // Clear old saved AP data without powering the WiFi radio off.
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(false, true);
  delay(300);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();

  while (WiFi.status() != WL_CONNECTED &&
         millis() - start < 15000) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi CONNECTED");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi FAILED. Will retry.");
  }
}

void maintainWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  unsigned long now = millis();
  if (now - lastWifiAttempt >= WIFI_RETRY_MS) {
    lastWifiAttempt = now;
    connectWiFi();
  }
}

// ============================================================
// MQTT CONNECT
// ============================================================
bool connectMQTT() {
  if (WiFi.status() != WL_CONNECTED) return false;

  String clientId = "BagGo-ESP32-" + WiFi.macAddress();
  clientId.replace(":", "");

  Serial.print("MQTT connecting to ");
  Serial.print(MQTT_BROKER);
  Serial.print(":");
  Serial.print(MQTT_PORT);
  Serial.print(" ... ");

  bool hasCredentials = strlen(MQTT_USER) > 0;
  bool ok;
  if (hasCredentials) {
    ok = mqttClient.connect(
      clientId.c_str(),
      MQTT_USER,
      MQTT_PASSWORD,
      topicOnline.c_str(),
      1,
      true,
      "offline"
    );
  } else {
    ok = mqttClient.connect(
      clientId.c_str(),
      topicOnline.c_str(),
      1,
      true,
      "offline"
    );
  }

  if (!ok) {
    Serial.print("FAILED rc=");
    Serial.println(mqttClient.state());
    return false;
  }

  Serial.println("CONNECTED");

  mqttClient.subscribe(topicOpen.c_str(), 1);
  mqttClient.subscribe(topicClose.c_str(), 1);
  mqttClient.subscribe(topicLed.c_str(), 1);

  mqttClient.publish(topicOnline.c_str(), "online", true);

  Serial.println("Subscribed:");
  Serial.println("  " + topicOpen);
  Serial.println("  " + topicClose);
  Serial.println("  " + topicLed);

  publishStatus();
  return true;
}

void maintainMQTT() {
  if (WiFi.status() != WL_CONNECTED) return;

  if (mqttClient.connected()) {
    mqttClient.loop();
    return;
  }

  unsigned long now = millis();

  if (now - lastMqttAttempt >= MQTT_RETRY_MS) {
    lastMqttAttempt = now;
    connectMQTT();
  }
}

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("================================");
  Serial.println(" BAGGO ESP32 STABLE MQTT DEMO");
  Serial.println("================================");

  String lockerTopic = "locker/" + String(LOCKER_ID);
  topicOpen   = buildMqttTopic(lockerTopic + "/open");
  topicClose  = buildMqttTopic(lockerTopic + "/close");
  topicLed    = buildMqttTopic(lockerTopic + "/led");
  topicStatus = buildMqttTopic(lockerTopic + "/status");
  topicOnline = buildMqttTopic(lockerTopic + "/online");

  pinMode(LATCH_595, OUTPUT);
  pinMode(CLOCK_595, OUTPUT);
  pinMode(DATA_595, OUTPUT);

  pinMode(LATCH_165, OUTPUT);
  pinMode(CLOCK_165, OUTPUT);
  pinMode(DATA_165, INPUT);

  digitalWrite(CLOCK_165, LOW);
  digitalWrite(LATCH_165, HIGH);

  ledMode = LED_RED_MODE;
  isUnlocking = false;
  applyOutputs();

  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);

  if (MQTT_USE_TLS) {
    // For production, replace setInsecure() with setCACert(rootCa) for your
    // broker. This still encrypts traffic but does not verify its certificate.
    secureMqttClient.setInsecure();
    mqttClient.setClient(secureMqttClient);
    Serial.println("MQTT TLS enabled (certificate verification disabled)");
  } else {
    mqttClient.setClient(plainMqttClient);
  }
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setKeepAlive(30);
  mqttClient.setSocketTimeout(5);
  mqttClient.setBufferSize(512);

  connectWiFi();

  if (WiFi.status() == WL_CONNECTED) {
    connectMQTT();
  }
}

// ============================================================
// LOOP
// ============================================================
void loop() {
  maintainWiFi();
  maintainMQTT();

  unsigned long now = millis();

  if (now - lastSensorRead >= SENSOR_INTERVAL_MS) {
    lastSensorRead = now;
    updateSensor();
  }

  if (isUnlocking && now - unlockStartTime >= UNLOCK_TIME_MS) {
    closeLock();
  }

  handleBlink();

  if (now - lastStatusPublish >= STATUS_INTERVAL_MS) {
    lastStatusPublish = now;
    publishStatus();
  }

  delay(2);
}
