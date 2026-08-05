# Hướng Dẫn Triển Khai BAGGO Lên Vercel & Cloud Backend

## 1. Tổng Quan Kiến Trúc Khi Đưa Lên Cloud

Hệ thống BAGGO gồm 3 thành phần chính:
1. **Frontend (React + Vite + Tailwind)**: Đã được cấu hình để triển khai trực tiếp lên **Vercel**.
2. **Backend (FastAPI + OpenCV + SQLite + MQTT)**: Khuyên dùng triển khai lên **Render.com** / **Railway.app** / **Fly.io** (chạy VPS/Docker 24/7).
   - *Lưu ý về Vercel*: Vercel Serverless không giữ được kết nối MQTT / WebSockets liên tục 24/7 và hệ thống file của Vercel là Read-Only (không ghi được SQLite local persistent).
3. **MQTT Broker**: Chuyển từ Mosquitto localhost sang **HiveMQ Cloud** hoặc **EMQX Cloud** (miễn phí) để ESP32 kết nối qua Internet.

---

## 2. Các Bước Triển Khai Frontend Lên Vercel

### Bước 1: Chuẩn bị mã nguồn Frontend
- File `frontend/vercel.json` đã được khởi tạo để tự động xử lý Client-side Routing (SPA).

### Bước 2: Deploy qua Vercel Dashboard (Khuyên dùng)
1. Đẩy dự án lên **GitHub** / **GitLab**.
2. Truy cập [Vercel Dashboard](https://vercel.com/dashboard) -> Chọn **Add New Project**.
3. Import Repository `BagGo`.
4. Trong phần cấu hình dự án:
   - **Root Directory**: Chọn `frontend`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. **Environment Variables (Biến môi trường)**:
   - `VITE_API_BASE_URL`: URL API Backend (ví dụ: `https://baggo-api.onrender.com`)
   - `VITE_WS_BASE_URL`: URL WebSocket Backend (ví dụ: `wss://baggo-api.onrender.com`)
6. Nhấn **Deploy**.

---

## 3. Triển Khai Backend (FastAPI + WebSockets + MQTT) Lên Render.com

1. Đăng ký tài khoản tại [Render.com](https://render.com/).
2. Chọn **New** -> **Web Service**.
3. Kết nối với repository GitHub của bạn.
4. Cấu hình Web Service:
   - **Root Directory**: `backend`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Thêm các biến môi trường cho MQTT broker (HiveMQ) nếu cần kết nối phần cứng từ xa.
