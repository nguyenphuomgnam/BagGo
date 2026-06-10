# BAGGO - Hệ Thống Tủ Gửi Đồ Thông Minh IoT Cho Khách Du Lịch

**BAGGO** là giải pháp tủ khóa thông minh (Smart Locker) tối ưu dành riêng cho khách du lịch tự túc. Dự án kết hợp phần cứng IoT điều khiển chốt khóa vật lý, trí tuệ nhân tạo (AI Face ID) để nhận diện khuôn mặt và giao diện web hiện đại phục vụ việc đặt chỗ, thanh toán trực tuyến và quản lý vận hành.

---

## 1. Kiến Trúc Hệ Thống (Architecture)

Hệ thống hoạt động theo mô hình phi tập trung giữa Thiết bị Phần cứng (IoT), Server Trung tâm (Backend) và các Giao diện người dùng (Frontend):

```
                        +---------------------------------------+
                        |           ESP32 Firmware (IoT)        |
                        |   - Latch Lock & Door Sensor          |
                        |   - MQTT Client (Status/Commands)     |
                        +---------------------------------------+
                                            ^
                                            | (MQTT qua Port 1883)
                                            v
                        +---------------------------------------+
                        |        MQTT Broker (Mosquitto)        |
                        +---------------------------------------+
                                            ^
                                            | (Paho MQTT)
                                            v
                        +---------------------------------------+
                        |        FastAPI Backend (Server)       |
                        |   - SQLite (Lưu trữ Rentals & Lockers)|
                        |   - DeepFace (Trích xuất Face ID)     |
                        |   - WebSocket (Đồng bộ Real-time)     |
                        +---------------------------------------+
                               ^            ^            ^
                               |            |            | (REST / WebSocket)
            +------------------+            |            +------------------+
            |                               |                               |
            v                               v                               v
+-----------------------+       +-----------------------+       +-----------------------+
|   Kiosk UI (Tại tủ)   |       | Tourist App (Di động) |       |  Admin UI (Giám sát)  |
| - Đăng ký gửi/nhận    |       | - Bản đồ tủ trống     |       | - Theo dõi real-time  |
| - Quét mặt & Thanh toán|      | - Tìm tủ qua nháy LED |       | - Mở khóa khẩn cấp    |
+-----------------------+       +-----------------------+       +-----------------------+
```

### Luồng tương tác chính (Workflow):
1. **Đặt tủ**: Người dùng chọn ngăn tủ trên Kiosk hoặc đặt trước qua Điện thoại (Client).
2. **Xác thực Face ID**: Camera chụp ảnh khuôn mặt, FastAPI dùng **DeepFace (Facenet512)** trích xuất đặc trưng (embedding) lưu vào SQLite.
3. **Thanh toán & Mở khóa**: Sau khi xác nhận thanh toán, Backend gửi lệnh qua **MQTT** (`locker/1/open`) -> ESP32 nhận lệnh điều khiển IC dịch **74HC595** mở chốt khóa vật lý.
4. **Giám sát trạng thái**: ESP32 đọc cảm biến cửa tủ qua **74HC165** gửi ngược trạng thái lên MQTT -> Backend chuyển tiếp qua **WebSockets** cập nhật tức thời lên màn hình Admin.

---

## 2. Công Nghệ Sử Dụng (Technology Stack)

### **Frontend (Giao diện người dùng)**
*   **React (Vite)**: Single Page Application cho hiệu năng mượt mà và thời gian build cực nhanh.
*   **Tailwind CSS**: Thiết kế giao diện Glassmorphism (kính mờ) hiện đại, hỗ trợ hiển thị tối ưu trên cả Kiosk (Tablet), Di động và Desktop.
*   **Leaflet.js & React-Leaflet**: Bản đồ mã nguồn mở (miễn phí) định vị vị trí các tủ BAGGO xung quanh khách du lịch.
*   **Recharts**: Vẽ biểu đồ SVG trực quan hóa doanh thu và hiệu suất sử dụng tủ của quản trị viên.

### **Backend (Hệ thống máy chủ)**
*   **FastAPI (Python)**: Framework API tốc độ cao, hỗ trợ xử lý WebSockets không đồng bộ.
*   **DeepFace & OpenCV**: Trích xuất và so khớp đặc trưng khuôn mặt (độ chính xác cao với khoảng cách Euclidean).
*   **SQLite**: Cơ sở dữ liệu gọn nhẹ lưu trữ thông tin tủ, lượt thuê và lịch sử giao dịch.
*   **Paho-MQTT**: Thư viện Python giao tiếp với MQTT Broker.

### **Firmware (Thiết bị IoT)**
*   **ESP32**: Vi điều khiển chính tích hợp WiFi.
*   **74HC595 & 74HC165**: IC mở rộng ngõ ra (điều khiển relay khóa, LED) và ngõ vào (đọc cảm biến phản hồi chốt).
*   **PubSubClient**: Kết nối và sub/pub các topic điều khiển của MQTT.
*   **WiFiManager**: Cấu hình kết nối WiFi và IP Broker MQTT qua điểm truy cập phát sóng (AP).

---

## 3. Hướng Dẫn Cài Đặt & Chạy Dự Án (How to Run)

### **Chuẩn bị (Prerequisites)**
*   Đã cài đặt **Node.js** (Phiên bản >= 18) và **Python** (Phiên bản >= 3.10).
*   Máy tính đã chạy **MQTT Broker** (ví dụ: Mosquitto) chạy tại cổng `1883` ở localhost.

---

### **BƯỚC 1: Khởi động Backend**
1. Mở Terminal và di chuyển vào thư mục `backend/`:
   ```bash
   cd backend
   ```
2. Cài đặt các thư viện Python cần thiết:
   ```bash
   pip install -r requirements.txt
   ```
3. Chạy Server Backend bằng Uvicorn:
   ```bash
   .\.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
*Server Backend sẽ hoạt động tại địa chỉ: `http://localhost:8000`*

---

### **BƯỚC 2: Khởi động Frontend**
1. Mở một cửa sổ Terminal mới và di chuyển vào thư mục `frontend/`:
   ```bash
   cd frontend
   ```
2. Cài đặt các gói NPM (nếu chạy lần đầu):
   ```bash
   npm install
   ```
3. Khởi động máy chủ phát triển (Vite Dev Server):
   ```bash
   npm run dev
   ```
*Giao diện người dùng sẽ chạy tại địa chỉ: `http://localhost:5173`*

---

### **BƯỚC 3: Kết nối Thiết bị IoT (ESP32)**
1. Nạp code firmware [omni_locker_fw.ino](firmware/omni_locker_fw/omni_locker_fw.ino) vào ESP32 bằng Arduino IDE.
2. Khi khởi động lần đầu, ESP32 sẽ phát điểm truy cập WiFi tên là `Tu_Locker_Thinh` (mật khẩu: `123456789`).
3. Dùng điện thoại kết nối vào WiFi này, trình duyệt sẽ tự mở trang cấu hình. Nhập **Tên/Mật khẩu WiFi nhà bạn** và **IP của máy tính đang chạy Backend** vào ô `MQTT Server IP`.
4. ESP32 sẽ tự khởi động lại và kết nối vào hệ thống.
"# BagGo" 
