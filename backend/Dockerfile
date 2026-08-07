FROM python:3.10-slim

WORKDIR /app

# Install runtime dependencies. The headless OpenCV wheel does not require
# X11/OpenGL libraries.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && python -c "import cv2, os; cascade = os.path.join(cv2.data.haarcascades, 'haarcascade_frontalface_default.xml'); assert hasattr(cv2, 'CascadeClassifier'), 'OpenCV is missing CascadeClassifier'; assert os.path.isfile(cascade), f'Missing Haar cascade: {cascade}'; assert not cv2.CascadeClassifier(cascade).empty(), f'Cannot load Haar cascade: {cascade}'; print('OpenCV', cv2.__version__, 'face detector OK')"

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
