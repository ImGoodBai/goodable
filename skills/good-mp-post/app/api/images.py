"""
Images API endpoints
Image upload and management
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.orm import Session
from pathlib import Path
import sys
import shutil
from datetime import datetime

# Add scripts to path for reusing existing functions
sys.path.insert(0, str(Path(__file__).parents[2] / 'scripts'))

from app.database import get_db, Image
from upload_media import upload_media

router = APIRouter()

# Images storage directory
IMAGES_DIR = Path(__file__).parents[2] / "data" / "images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/images/upload")
async def upload_image(
    file: UploadFile = File(...),
    type: str = Form(...),
    article_id: int = Form(None),
    db: Session = Depends(get_db)
):
    """
    Upload image to local storage (and optionally WeChat for thumb type)

    Args:
        file: Image file
        type: thumb or image
        article_id: Optional article ID to associate with

    Note:
        - For thumb (cover): Upload to WeChat immediately (permanent material)
        - For image (content): Save locally, upload to WeChat only when publishing
          (WeChat temporary materials expire after 3 days)
    """
    # Validate file type
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")

    # Validate media type
    if type not in ['thumb', 'image']:
        raise HTTPException(status_code=400, detail="Type must be 'thumb' or 'image'")

    try:
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        ext = Path(file.filename).suffix
        filename = f"{type}_{timestamp}{ext}"
        file_path = IMAGES_DIR / filename

        # Save file to local storage
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        media_id = None

        # Upload to WeChat only for thumb (cover images)
        if type == 'thumb':
            media_id = upload_media(str(file_path), type)

        # Save to database
        db_image = Image(
            article_id=article_id,
            file_path=str(file_path),
            media_id=media_id,
            media_type=type,
            file_size=file_path.stat().st_size
        )
        db.add(db_image)
        db.commit()
        db.refresh(db_image)

        # Return result with local URL
        return {
            "success": True,
            "media_id": media_id,
            "url": f"/data/images/{filename}",
            "file_size": db_image.file_size
        }

    except Exception as e:
        # Clean up file if upload failed
        if file_path.exists():
            file_path.unlink()

        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/images")
async def get_images(
    article_id: int = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get image list with optional filtering"""
    query = db.query(Image)

    if article_id:
        query = query.filter(Image.article_id == article_id)

    images = query.order_by(Image.created_at.desc()).offset(skip).limit(limit).all()

    return [
        {
            "id": img.id,
            "article_id": img.article_id,
            "media_id": img.media_id,
            "media_type": img.media_type,
            "url": f"/data/images/{Path(img.file_path).name}",
            "file_size": img.file_size,
            "created_at": img.created_at
        }
        for img in images
    ]
