# Hướng Dẫn Triển Khai 100% Hệ Thống BAGGO Trên 1 Service Duy Nhất (Railway)

Hệ thống BAGGO đã được cấu hình **Đóng gói đơn dịch vụ (Single-Service Deployment)**. Cả **Frontend (React)** và **Backend (FastAPI)** sẽ được đóng gói chung vào 1 Docker container duy nhất trên Railway.

---

## 🌟 Lợi Ích Của Việc Đóng Gói Trên 1 Service Duy Nhất:
* **Chỉ cần 1 Service trên Railway**: Không cần tạo 2 service riêng lẻ.
* **Chỉ dùng 1 URL duy nhất**: Ví dụ `https://baggo-production.up.railway.app` cho cả Frontend và API.
* **Không còn lỗi CORS**: Vì Frontend và Backend chạy chung 1 gốc Domain/Origin.
* **Tiết kiệm tài nguyên & chi phí**: Chỉ tốn quota của 1 container duy nhất.

---

## 🚀 Các Bước Triển Khai 1-Click Trên Railway

### Bước 1: Tạo Dự Án Mới
1. Đăng nhập vào [Railway.app](https://railway.app/).
2. Nhấn **New Project** -> chọn **Deploy from GitHub repo**.
3. Chọn repository `BagGo`.

### Bước 2: Railway Tự Động Nhận Diện & Build
Railway sẽ tự động tìm thấy file `Dockerfile` ở thư mục gốc của dự án:
- **Giai đoạn 1**: Node.js tự động build giao diện Frontend (React + Vite).
- **Giai đoạn 2**: Python cài đặt FastAPI + OpenCV + DeepFace và đưa Frontend static vào phục vụ chung.

### Bước 3: Tạo Domain Công Khai
1. Trong màn hình Canvas của Railway, chọn Service vừa tạo.
2. Vào tab **Networking** -> Nhấn **Generate Domain**.
3. Bạn sẽ nhận được 1 đường dẫn duy nhất (ví dụ: `https://baggo-production.up.railway.app`).

### Bước 4: (Tùy chọn) Thêm Volume Lưu Trữ Cơ Sở Dữ Liệu
Để dữ liệu tủ (`locker.db`) không bị reset khi restart container:
1. Vào tab **Volumes** của Service trên Railway.
2. Nhấn **Add Volume** và nhập Mount Path là: `/app/locker.db`

---

## 🔒 Biến Môi Trường (Environment Variables) - Tùy chọn

Nếu bạn dùng MQTT Cloud bên ngoài (như HiveMQ), bạn thêm vào tab **Variables**:
* `MQTT_BROKER`: `xxxxxxxx.hivemq.cloud`
* `MQTT_PORT`: `8883`
* `MQTT_USER`: `<tên đăng nhập>`
* `MQTT_PASSWORD`: `<mật khẩu>`

*(Nếu không khai báo, hệ thống sẽ tự động chạy chế độ fallback).*
