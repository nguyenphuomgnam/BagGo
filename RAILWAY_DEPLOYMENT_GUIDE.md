# Hướng Dẫn Triển Khai Toàn Bộ Hệ Thống BAGGO Trên Railway.app

**Railway.app** cho phép bạn triển khai **TOÀN BỘ HỆ THỐNG BAGGO** (bao gồm Frontend, Backend FastAPI, MQTT Broker Mosquitto, và Cơ sở dữ liệu) chỉ trên cùng một nền tảng duy nhất!

---

## 1. Ưu Điểm Khi Triển Khai 100% Trên Railway
* **Quản lý tập trung**: Tất cả các dịch vụ (Frontend, Backend, MQTT, DB) nằm chung một Dashboard.
* **Hỗ trợ 24/7**: Chạy các tiến trình liên tục, duy trì kết nối WebSocket và MQTT với thiết bị phần cứng ESP32.
* **Lưu trữ dữ liệu an toàn**: Hỗ trợ **Volume persistent** cho SQLite (hoặc khởi tạo Postgres chỉ với 1-click).
* **Kết nối nội bộ siêu nhanh**: Backend giao tiếp với MQTT Broker qua mạng nội bộ của Railway với độ trễ cực thấp.

---

## 2. Kiến Trúc Dịch Vụ Trên Railway

Trên một dự án Railway (Railway Project), bạn tạo 3 Service:

1. **Service 1: Backend (FastAPI)**
   - Source code directory: `backend/`
   - Sử dụng file `backend/Dockerfile` đã chuẩn bị sẵn.
   - Gắn Volume persistent vào `/app/locker.db` (nếu dùng SQLite) để không bị mất dữ liệu khi restart.

2. **Service 2: Frontend (React / Vite)**
   - Source code directory: `frontend/`
   - Sử dụng file `frontend/Dockerfile` đã chuẩn bị sẵn.
   - Biến môi trường: `VITE_API_BASE_URL` trỏ tới domain public của Service Backend.

3. **Service 3: MQTT Broker (Mosquitto)** *(Tùy chọn nếu dùng MQTT riêng)*
   - Thêm Docker Image: `eclipse-mosquitto:latest`
   - Mở port TCP `1883` để ESP32 kết nối vào.

---

## 3. Các Bước Triển Khai Chi Tiết

### Bước 1: Tạo dự án mới trên Railway
1. Đăng nhập [Railway.app](https://railway.app/).
2. Nhấn **New Project** -> chọn **Deploy from GitHub repo**.
3. Chọn repository `BagGo`.

### Bước 2: Deploy Backend (FastAPI)
1. Trong canvas dự án, chọn Service đầu tiên -> đổi tên thành `baggo-backend`.
2. Vào phần **Settings**:
   - **Root Directory**: `backend`
   - **Builder**: Chọn `Dockerfile` (Railway sẽ tự phát hiện `backend/Dockerfile`).
3. Vào phần **Networking**:
   - Nhấn **Generate Domain** để lấy URL Backend public (ví dụ: `baggo-backend-production.up.railway.app`).
4. Vào phần **Volumes**:
   - Thêm Volume gắn vào đường dẫn `/app/locker.db` để lưu trữ dữ liệu tủ SQLite lâu dài.

### Bước 3: Deploy Frontend (React App)
1. Trong cùng Project đó, nhấn **New Service** -> **GitHub Repo** -> Chọn lại repository `BagGo`.
2. Đổi tên Service thành `baggo-frontend`.
3. Vào phần **Settings**:
   - **Root Directory**: `frontend`
   - **Builder**: Chọn `Dockerfile` (Railway sẽ tự phát hiện `frontend/Dockerfile`).
4. Vào phần **Variables**:
   - Thêm `VITE_API_BASE_URL` = `https://baggo-backend-production.up.railway.app`
   - Thêm `VITE_WS_BASE_URL` = `wss://baggo-backend-production.up.railway.app`
5. Vào phần **Networking**:
   - Nhấn **Generate Domain** để lấy URL Frontend truy cập công khai.

---

## 4. So Sánh: Railway 100% vs (Vercel + Railway)

| Tiêu chí | Triển khai 100% trên Railway | Vercel (Frontend) + Railway (Backend) |
| :--- | :--- | :--- |
| **Độ tiện lợi** | **Rất cao** (Quản lý 1 nơi duy nhất) | Trung bình (Quản lý ở 2 Dashboard) |
| **Hỗ trợ Backend/MQTT** | **100% Hoàn hảo** (Chạy 24/7) | **100% Hoàn hảo** (Backend trên Railway) |
| **Băng thông Frontend** | Tính theo quota Railway | **Miễn phí không giới hạn** (Vercel Free) |
| **Khuyên dùng** | **Tốt nhất cho dự án IoT toàn diện** | Tốt nếu muốn tiết kiệm quota Railway |
