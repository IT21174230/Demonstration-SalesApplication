import os
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from Utils.Chat.init_chat import send_response
from routes.frontend_api import router as frontend_router

app = FastAPI()

# CORS — allow the Vite dev server to talk to FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the frontend dashboard REST routes
app.include_router(frontend_router)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            user_query = await websocket.receive_text()
            answer = await send_response(user_query)
            await websocket.send_text(answer)
    except WebSocketDisconnect:
        pass


# ---------------------------------------------------------------------------
# Serve the built frontend (Docker / production only).
# In development the Vite dev server handles this on port 5173.
# ---------------------------------------------------------------------------
STATIC_DIR = Path(__file__).resolve().parent / "static"

if STATIC_DIR.is_dir():
    # Serve JS/CSS/images from /assets and other static files
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa_catch_all(request: Request, full_path: str):
        """Return index.html for any route not matched by the API or WebSocket."""
        file = STATIC_DIR / full_path
        if file.is_file():
            return FileResponse(file)
        return FileResponse(STATIC_DIR / "index.html")
