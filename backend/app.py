from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse

from config import APP_VERSION, BASE_DIR
from backend.routes.stream_routes import router as stream_router
from backend.routes.font_routes import router as font_router
from backend.routes.render_routes import router as render_router

app = FastAPI(
    title="Premiere Properties Subtitle Studio API",
    version=APP_VERSION,
    description="Modular Video Subtitle & Essential Graphics Automation Engine"
)

# Enable GZip compression (70%+ bandwidth & load time optimization)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Enable CORS for local development and Colab iframe integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Router Modules
app.include_router(stream_router, prefix="/api", tags=["Stream"])
app.include_router(font_router, prefix="/api", tags=["Fonts"])
app.include_router(render_router, prefix="/api", tags=["Render"])

# Mount static frontend directory with robust fallback path resolution
frontend_path = BASE_DIR / "frontend"
if not frontend_path.exists():
    frontend_path = Path("frontend").resolve()

if frontend_path.exists():
    app.mount("/frontend", StaticFiles(directory=str(frontend_path), html=True), name="frontend")

@app.get("/")
def root_redirect():
    """
    Redirect root endpoint directly to frontend UI.
    """
    return RedirectResponse(url="/frontend/index.html")

@app.get("/api/health")
def health_check():
    """
    Returns app health status and version string.
    """
    return {
        "status": "online",
        "app": "Premiere Properties Subtitle Studio",
        "version": APP_VERSION
    }
