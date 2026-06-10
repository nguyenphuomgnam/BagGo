from fastapi import APIRouter
from app.database import get_db
from app.services.locker_state import decorate_locker_row
from app.services.rental_service import expire_pending_reservations

router = APIRouter()

@router.get("/lockers")
def get_lockers():
    expire_pending_reservations()
    conn = get_db()
    rows = conn.execute(
        """
        SELECT
            l.*,
            r.id AS active_rental_id,
            r.payment_status AS active_rental_payment_status,
            r.start_time AS active_rental_start_time,
            r.end_time AS active_rental_end_time,
            CASE WHEN fa.rental_id IS NULL THEN 0 ELSE 1 END AS active_rental_has_face
        FROM lockers l
        LEFT JOIN rentals r ON r.id = (
            SELECT id
            FROM rentals
            WHERE locker_id = l.id AND status IN ('RESERVED','OCCUPIED','OVERTIME')
            ORDER BY id DESC
            LIMIT 1
        )
        LEFT JOIN face_embeddings_active fa ON fa.rental_id = r.id
        ORDER BY l.id
        """
    ).fetchall()
    conn.close()
    return [decorate_locker_row(row) for row in rows]
