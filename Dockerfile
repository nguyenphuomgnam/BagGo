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

# Install OpenCV & system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./

# Copy built frontend dist from Stage 1 into static/frontend_dist
COPY --from=frontend-builder /app/frontend/dist ./static/frontend_dist

EXPOSE 8000

CMD ["python", "-m", "app.main"]
