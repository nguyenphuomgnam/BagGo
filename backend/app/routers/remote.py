from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.face_service import extract_embedding, identify_face
from app.database import get_db
from app.services.locker_service import blink_locker
from app.services.rental_service import format_time_left, log_action

router = APIRouter()

@router.post("/remote/identify")
async def remote_identify(file: UploadFile = File(...)):
    contents = await file.read()
    embedding = extract_embedding(contents)
    if embedding is None:
        raise HTTPException(400, "Không tìm thấy khuôn mặt")
    rental_id = identify_face(embedding)
    if rental_id is None:
        raise HTTPException(401, "Không tìm thấy thông tin thuê")
    conn = get_db()
    rental = conn.execute("SELECT * FROM rentals WHERE id = ?", (rental_id,)).fetchone()
    conn.close()
    payload = {
        "rental_id": rental_id,
        "locker_id": rental["locker_id"],
        "status": rental["status"]
    }
    payload.update(format_time_left(rental["end_time"]))
    log_action(rental["locker_id"], "customer", "REMOTE_IDENTIFY", f"Tra cứu từ xa phiên #{rental_id}")
    return payload

@router.post("/remote/blink/{locker_id}")
def remote_blink(locker_id: int):
    blink_locker(locker_id)
    log_action(locker_id, "customer", "BLINK_LED", "Nháy LED tìm tủ")
    return {"status": "blinking"}
