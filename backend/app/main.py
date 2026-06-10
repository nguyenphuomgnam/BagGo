from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from app.database import init_db
from app.mqtt_client import start_mqtt
from app.websocket_manager import manager
from app.routers import lockers, access, admin, remote
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI()
BASE_DIR = Path(__file__).resolve().parents[1]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/kiosk", StaticFiles(directory=str(BASE_DIR / "static" / "kiosk"), html=True), name="kiosk")
app.mount("/admin", StaticFiles(directory=str(BASE_DIR / "static" / "admin"), html=True), name="admin")
app.mount("/remote", StaticFiles(directory=str(BASE_DIR / "static" / "remote"), html=True), name="remote")

@app.on_event("startup")
async def startup():
    init_db()
    start_mqtt()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

app.include_router(lockers.router, prefix="/api")
app.include_router(access.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(remote.router, prefix="/api")

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
