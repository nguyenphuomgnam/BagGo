import logging
import os
import pickle

import cv2
import numpy as np


logger = logging.getLogger(__name__)

OPENCV_ENGINE = "opencv_signature_v1"
FACE_ENGINE = os.getenv("FACE_ENGINE", "opencv").strip().lower()
OPENCV_MATCH_THRESHOLD = float(os.getenv("FACE_MATCH_THRESHOLD", "0.45"))
DEEPFACE_MATCH_THRESHOLD = float(os.getenv("DEEPFACE_MATCH_THRESHOLD", "10.0"))
ALLOW_CENTER_CROP_FALLBACK = os.getenv("FACE_ALLOW_CENTER_CROP", "true").strip().lower() not in {
    "0",
    "false",
    "no",
}


def _safe_log_text(value: object) -> str:
    return str(value).encode("ascii", "backslashreplace").decode("ascii")


def _decode_image(image_bytes: bytes):
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return None
    return img


def _detect_face(gray):
    cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
    detector = cv2.CascadeClassifier(cascade_path)
    if detector.empty():
        return None

    faces = detector.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=4, minSize=(70, 70))
    if len(faces) == 0:
        faces = detector.detectMultiScale(gray, scaleFactor=1.05, minNeighbors=3, minSize=(45, 45))
    if len(faces) == 0:
        return None

    return max(faces, key=lambda box: box[2] * box[3])


def _crop_face(gray):
    box = _detect_face(gray)
    if box is not None:
        x, y, w, h = [int(v) for v in box]
        margin = int(max(w, h) * 0.18)
        x1 = max(0, x - margin)
        y1 = max(0, y - margin)
        x2 = min(gray.shape[1], x + w + margin)
        y2 = min(gray.shape[0], y + h + margin)
        return gray[y1:y2, x1:x2], True

    if not ALLOW_CENTER_CROP_FALLBACK:
        return None, False

    size = int(min(gray.shape[:2]) * 0.72)
    y1 = max(0, (gray.shape[0] - size) // 2)
    x1 = max(0, (gray.shape[1] - size) // 2)
    return gray[y1 : y1 + size, x1 : x1 + size], False


def _normalise_vector(vector):
    vector = np.asarray(vector, dtype=np.float32).flatten()
    vector = vector - float(np.mean(vector))
    std = float(np.std(vector))
    if std > 1e-6:
        vector = vector / std
    norm = float(np.linalg.norm(vector))
    if norm > 1e-6:
        vector = vector / norm
    return vector


def _opencv_embedding(image_bytes: bytes):
    img = _decode_image(image_bytes)
    if img is None:
        return None

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    face, detected = _crop_face(gray)
    if face is None or face.size == 0:
        return None

    face = cv2.resize(face, (96, 96), interpolation=cv2.INTER_AREA)
    face = cv2.equalizeHist(face)
    face = cv2.GaussianBlur(face, (3, 3), 0)

    low_res = cv2.resize(face, (32, 32), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
    dct = cv2.dct((face.astype(np.float32) / 255.0) - 0.5)
    dct_features = dct[:16, :16].flatten()
    dct_features[0] = 0.0

    vector = _normalise_vector(np.concatenate([low_res.flatten(), dct_features]))
    return {
        "engine": OPENCV_ENGINE,
        "vector": vector.tolist(),
        "detected": detected,
    }


def _deepface_embedding(image_bytes: bytes):
    try:
        from deepface import DeepFace

        img = _decode_image(image_bytes)
        if img is None:
            return None

        rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        embedding_objs = DeepFace.represent(
            img_path=rgb_img,
            model_name="Facenet512",
            enforce_detection=False,
            detector_backend="opencv",
        )
        if not embedding_objs:
            return None
        return {
            "engine": "deepface_facenet512",
            "vector": embedding_objs[0]["embedding"],
            "detected": True,
        }
    except Exception as exc:
        logger.warning("DeepFace embedding failed: %s", _safe_log_text(exc))
        return None


def extract_embedding(image_bytes: bytes):
    if FACE_ENGINE == "deepface":
        embedding = _deepface_embedding(image_bytes)
        if embedding is not None:
            return embedding
        logger.warning("Falling back to OpenCV face signature")

    try:
        return _opencv_embedding(image_bytes)
    except Exception as exc:
        logger.warning("OpenCV face embedding failed: %s", _safe_log_text(exc))
        return None


def _embedding_engine(embedding):
    if isinstance(embedding, dict):
        return embedding.get("engine") or "unknown"
    return "legacy_deepface"


def _embedding_vector(embedding):
    if isinstance(embedding, dict):
        embedding = embedding.get("vector")
    if embedding is None:
        return None
    vector = np.asarray(embedding, dtype=np.float32).flatten()
    if vector.size == 0:
        return None
    return vector


def _cosine_distance(left, right):
    left_norm = float(np.linalg.norm(left))
    right_norm = float(np.linalg.norm(right))
    if left_norm <= 1e-6 or right_norm <= 1e-6:
        return float("inf")
    similarity = float(np.dot(left, right) / (left_norm * right_norm))
    return 1.0 - similarity


def _distance_threshold(engine: str) -> float:
    if engine == OPENCV_ENGINE:
        return OPENCV_MATCH_THRESHOLD
    return DEEPFACE_MATCH_THRESHOLD


def _embedding_distance(query_embedding, stored_embedding):
    query_vector = _embedding_vector(query_embedding)
    stored_vector = _embedding_vector(stored_embedding)
    if query_vector is None or stored_vector is None:
        return None
    if query_vector.shape != stored_vector.shape:
        return None

    query_engine = _embedding_engine(query_embedding)
    stored_engine = _embedding_engine(stored_embedding)
    if query_engine == OPENCV_ENGINE and stored_engine == OPENCV_ENGINE:
        return _cosine_distance(query_vector, stored_vector)

    return float(np.linalg.norm(stored_vector - query_vector))


def identify_face(embedding):
    from app.database import get_db

    conn = get_db()
    rows = conn.execute(
        """
        SELECT fa.rental_id, fa.embedding
        FROM face_embeddings_active fa
        JOIN rentals r ON fa.rental_id = r.id
        WHERE r.status IN ('OCCUPIED', 'OVERTIME')
        """
    ).fetchall()
    conn.close()

    if not rows:
        return None

    best_distance = float("inf")
    best_rental_id = None
    query_engine = _embedding_engine(embedding)

    for row in rows:
        try:
            stored_embedding = pickle.loads(row["embedding"])
        except Exception as exc:
            logger.warning("Cannot load face embedding for rental %s: %s", row["rental_id"], _safe_log_text(exc))
            continue

        distance = _embedding_distance(embedding, stored_embedding)
        if distance is not None and distance < best_distance:
            best_distance = distance
            best_rental_id = row["rental_id"]

    if best_rental_id is not None and best_distance <= _distance_threshold(query_engine):
        return best_rental_id
    return None
