# Kết nối Railway ↔ MQTT Broker ↔ ESP32

Luồng điều khiển của BAGGO:

```text
Website → FastAPI trên Railway → MQTT Broker → ESP32 → relay/LED
Website ← WebSocket/REST ← FastAPI ← MQTT Broker ← trạng thái ESP32
```

Website không kết nối thẳng tới ESP32. Backend Railway và ESP32 bắt buộc phải dùng
cùng broker, port, tài khoản và topic prefix.

## 1. Chạy thử nhanh với broker public

Code hiện tại mặc định dùng:

```text
Broker: broker.emqx.io
Port: 1883
TLS: false
Topic prefix: baggo-7f3c91a2
```

Các topic của ngăn số 1:

```text
baggo-7f3c91a2/locker/1/open
baggo-7f3c91a2/locker/1/close
baggo-7f3c91a2/locker/1/led
baggo-7f3c91a2/locker/1/status
baggo-7f3c91a2/locker/1/online
```

Chỉ cần deploy backend mới và nạp file
`NEW_baggo_esp32_stable_no_wifimanager.ino` mới vào ESP32. Cấu hình này chỉ phù
hợp để test vì broker public không yêu cầu đăng nhập.

## 2. Biến môi trường trên Railway

Trong Railway, mở service BAGGO → **Variables** và khai báo:

```text
MQTT_BROKER=broker.emqx.io
MQTT_PORT=1883
MQTT_TLS=false
MQTT_USER=
MQTT_PASSWORD=
MQTT_TOPIC_PREFIX=baggo-7f3c91a2
```

Sau khi redeploy, mở:

```text
https://<domain-railway>/api/mqtt/status
```

Kết quả đúng phải có `"connected": true`. Khi ESP32 online, gọi
`/api/lockers` sẽ thấy ngăn 1 có `"hardware_online": 1`.

## 3. Cấu hình ESP32

Ở đầu file `.ino`, cập nhật Wi-Fi và khối MQTT. Các giá trị phải giống Railway:

```cpp
const int LOCKER_ID = 1;
const char* MQTT_BROKER = "broker.emqx.io";
const uint16_t MQTT_PORT = 1883;
const bool MQTT_USE_TLS = false;
const char* MQTT_USER = "";
const char* MQTT_PASSWORD = "";
const char* MQTT_TOPIC_PREFIX = "baggo-7f3c91a2";
```

ESP32 chỉ hỗ trợ Wi-Fi 2.4 GHz. Sau khi nạp code, mở Serial Monitor ở 115200 baud.
Kết nối đúng sẽ hiển thị `WiFi CONNECTED`, `MQTT ... CONNECTED` và danh sách ba
topic đã subscribe.

## 4. Cấu hình khuyến nghị cho production

Tạo broker riêng (ví dụ HiveMQ Cloud/EMQX Cloud) rồi đặt Railway:

```text
MQTT_BROKER=<hostname broker>
MQTT_PORT=8883
MQTT_TLS=true
MQTT_USER=<username>
MQTT_PASSWORD=<password>
MQTT_TOPIC_PREFIX=<prefix riêng khó đoán>
```

Sao chép chính xác các giá trị tương ứng sang firmware, đổi
`MQTT_USE_TLS = true`. Không commit mật khẩu broker hoặc mật khẩu Wi-Fi lên repo
public. Bản firmware hiện dùng `setInsecure()` khi bật TLS; trước khi vận hành
thật nên thay bằng `setCACert(rootCa)` của broker để xác minh chứng chỉ máy chủ.

## 5. Kiểm tra lệnh từ web

1. ESP32 phải báo `MQTT ... CONNECTED` trên Serial Monitor.
2. `/api/mqtt/status` phải báo `connected: true`.
3. Trang Admin phải hiện chấm xanh/`Online` ở ngăn 1.
4. Nhấn mở khóa ở Admin.
5. Railway Deploy Logs phải có `MQTT command -> baggo-7f3c91a2/locker/1/open: OPEN`.
6. Serial Monitor phải có `MQTT [baggo-7f3c91a2/locker/1/open] OPEN` và `LENH MO KHOA`.

Nếu ESP32 online nhưng điều khiển nhầm ngăn, kiểm tra `LOCKER_ID`. ID này phải
trùng với ID ngăn tủ trên website.
