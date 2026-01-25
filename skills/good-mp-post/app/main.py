"""
FastAPI main application
Web UI for WeChat article publishing
"""
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import os

# Import API routers
from app.api import articles, images

# Create FastAPI app
app = FastAPI(
    title="Good WeChat Article Publisher",
    description="Web UI for WeChat Official Account article management",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(articles.router, prefix="/api", tags=["articles"])
app.include_router(images.router, prefix="/api", tags=["images"])

# Mount static files
static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

# Data directory for images
data_dir = Path(__file__).parents[1] / "data" / "images"
if data_dir.exists():
    app.mount("/data/images", StaticFiles(directory=str(data_dir)), name="images")


@app.get("/")
async def root():
    """Serve index.html"""
    return FileResponse(str(static_dir / "index.html"))


@app.get("/health")
async def health():
    """Health check endpoint (required by platform)"""
    return {"status": "ok", "service": "good-mp-post"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "3100"))
    uvicorn.run(app, host="0.0.0.0", port=port)
