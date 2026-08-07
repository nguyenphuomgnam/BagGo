# Stage 1: Build React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .
RUN npm run build

# Stage 2: Python FastAPI Backend + Served Frontend Static Files
FROM python:3.10-slim
WORKDIR /app

# Install runtime dependencies for the FastAPI backend. OpenCV uses the
# headless wheel, so no X11/OpenGL packages are required in production.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && python -c "import cv2, os; cascade = os.path.join(cv2.data.haarcascades, 'haarcascade_frontalface_default.xml'); assert hasattr(cv2, 'CascadeClassifier'), 'OpenCV is missing CascadeClassifier'; assert os.path.isfile(cascade), f'Missing Haar cascade: {cascade}'; assert not cv2.CascadeClassifier(cascade).empty(), f'Cannot load Haar cascade: {cascade}'; print('OpenCV', cv2.__version__, 'face detector OK')"

COPY backend/ ./

# Copy built frontend dist from Stage 1 into static/frontend_dist
COPY --from=frontend-builder /app/frontend/dist ./static/frontend_dist

EXPOSE 8000

CMD ["python", "-m", "app.main"]
