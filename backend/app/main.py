from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from pathlib import Path
from app.database import init_db
from app.mqtt_client import start_mqtt
from app.websocket_manager import manager
from app.routers import lockers, access, admin, remote
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os

BASE_DIR = Path(__file__).resolve().parents[1]

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB & MQTT on startup
    init_db()
    start_mqtt()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routers (Must be registered before SPA catch-all)
app.include_router(lockers.router, prefix="/api")
app.include_router(access.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(remote.router, prefix="/api")

# Static legacy mounts (if exist)
kiosk_dir = BASE_DIR / "static" / "kiosk"
if kiosk_dir.exists():
    app.mount("/kiosk", StaticFiles(directory=str(kiosk_dir), html=True), name="kiosk")

admin_dir = BASE_DIR / "static" / "admin"
if admin_dir.exists():
    app.mount("/admin", StaticFiles(directory=str(admin_dir), html=True), name="admin")

remote_dir = BASE_DIR / "static" / "remote"
if remote_dir.exists():
    app.mount("/remote", StaticFiles(directory=str(remote_dir), html=True), name="remote")

uploads_dir = BASE_DIR / "static" / "uploads"
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Serve SPA Frontend built bundle (Single-service deployment)
frontend_dist = BASE_DIR / "static" / "frontend_dist"
if frontend_dist.exists():
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        target_file = frontend_dist / full_path
        if full_path and target_file.exists() and target_file.is_file():
            return FileResponse(target_file)
        return FileResponse(frontend_dist / "index.html")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port)
