"""
Articles API endpoints
CRUD operations and publish functionality
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import sys
from pathlib import Path
import markdown

# Add scripts to path for reusing existing functions
sys.path.insert(0, str(Path(__file__).parents[2] / 'scripts'))

from app.database import get_db, Article
from create_draft import create_draft
from publish_article import publish_article
from wechat_html_converter import convert_to_wechat_html
from upload_media import upload_media
from theme_loader import get_available_themes, get_theme_info
import re

router = APIRouter()


def detect_relative_image_paths(markdown_content: str) -> List[str]:
    """
    Detect relative image paths in Markdown content

    Args:
        markdown_content: Markdown content string

    Returns:
        List of relative image paths found
    """
    if not markdown_content:
        return []

    # Pattern to match Markdown images: ![alt](path)
    # Exclude: http://, https://, /data/images/
    pattern = r'!\[.*?\]\((?!https?://|/data/images/)([^)]+)\)'
    matches = re.findall(pattern, markdown_content)

    return matches


def process_content_images(content_html: str, article_id: int, db: Session) -> str:
    """
    Process content images: upload local images to WeChat and replace URLs

    Args:
        content_html: HTML content with local image URLs
        article_id: Article ID
        db: Database session

    Returns:
        HTML with WeChat image URLs
    """
    from app.database import Image

    # Find all image tags
    img_pattern = r'<img[^>]+src="([^"]+)"[^>]*>'

    images_dir = Path(__file__).parents[2] / "data" / "images"

    # Store replacements to apply after all uploads
    replacements = {}

    matches = list(re.finditer(img_pattern, content_html))
    for match in matches:
        img_tag = match.group(0)
        img_url = match.group(1)

        # Only process local images
        if img_url.startswith('/data/images/'):
            filename = img_url.split('/')[-1]
            file_path = images_dir / filename

            if file_path.exists():
                try:
                    # Check if already uploaded to WeChat
                    db_image = db.query(Image).filter(
                        Image.article_id == article_id,
                        Image.file_path == str(file_path)
                    ).first()

                    wechat_url = None
                    if db_image and db_image.media_id:
                        # Already uploaded, use existing URL
                        wechat_url = db_image.media_id  # For image type, media_id stores the URL
                    else:
                        # Upload to WeChat using uploadimg API (returns URL)
                        wechat_url = upload_media(str(file_path), 'image')

                        # Update database with URL (stored in media_id field for compatibility)
                        if db_image:
                            db_image.media_id = wechat_url
                        else:
                            db_image = Image(
                                article_id=article_id,
                                file_path=str(file_path),
                                media_id=wechat_url,  # Store WeChat CDN URL
                                media_type='image',
                                file_size=file_path.stat().st_size
                            )
                            db.add(db_image)

                        db.commit()

                    # Record replacement
                    if wechat_url:
                        replacements[img_url] = wechat_url

                except Exception as e:
                    # Log error but continue with other images
                    print(f"Warning: Failed to upload image {filename}: {str(e)}")

    # Apply all replacements to HTML
    for local_url, wechat_url in replacements.items():
        content_html = content_html.replace(f'src="{local_url}"', f'src="{wechat_url}"')

    return content_html


# Pydantic models for request/response
class ArticleCreate(BaseModel):
    title: str
    author: str
    digest: Optional[str] = None
    content_md: Optional[str] = None
    thumb_media_id: Optional[str] = None
    thumb_url: Optional[str] = None
    theme: Optional[str] = 'default'


class ArticleUpdate(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    digest: Optional[str] = None
    content_md: Optional[str] = None
    thumb_media_id: Optional[str] = None
    thumb_url: Optional[str] = None
    theme: Optional[str] = None


class ArticleResponse(BaseModel):
    id: int
    title: str
    author: str
    digest: Optional[str]
    content_md: Optional[str]
    content_html: Optional[str]
    thumb_media_id: Optional[str]
    thumb_url: Optional[str]
    draft_media_id: Optional[str]
    publish_id: Optional[str]
    status: str
    error_msg: Optional[str]
    theme: Optional[str] = 'default'
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime]

    class Config:
        from_attributes = True


@router.get("/articles", response_model=List[ArticleResponse])
async def get_articles(
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get article list with optional filtering"""
    query = db.query(Article)

    if status:
        query = query.filter(Article.status == status)

    articles = query.order_by(Article.created_at.desc()).offset(skip).limit(limit).all()
    return articles


@router.get("/articles/{article_id}", response_model=ArticleResponse)
async def get_article(article_id: int, db: Session = Depends(get_db)):
    """Get article detail by ID"""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


@router.post("/articles", response_model=ArticleResponse)
async def create_article(article: ArticleCreate, db: Session = Depends(get_db)):
    """Create new article draft"""
    # Convert Markdown to WeChat-compatible HTML if content provided
    content_html = None
    if article.content_md:
        # Step 1: Convert Markdown to standard HTML
        standard_html = markdown.markdown(article.content_md, extensions=['extra'])
        # Step 2: Add WeChat inline styles with theme
        content_html = convert_to_wechat_html(standard_html, article.theme or 'default')

    # Create database record
    db_article = Article(
        title=article.title,
        author=article.author,
        digest=article.digest,
        content_md=article.content_md,
        content_html=content_html,
        thumb_media_id=article.thumb_media_id,
        thumb_url=article.thumb_url,
        theme=article.theme or 'default',
        status="draft"
    )

    db.add(db_article)
    db.commit()
    db.refresh(db_article)

    return db_article


@router.put("/articles/{article_id}", response_model=ArticleResponse)
async def update_article(
    article_id: int,
    article: ArticleUpdate,
    db: Session = Depends(get_db)
):
    """Update article"""
    db_article = db.query(Article).filter(Article.id == article_id).first()
    if not db_article:
        raise HTTPException(status_code=404, detail="Article not found")

    # Update fields
    update_data = article.dict(exclude_unset=True)

    # Determine theme for HTML conversion
    theme = update_data.get('theme', db_article.theme or 'default')

    # Convert Markdown to WeChat-compatible HTML if content updated
    if "content_md" in update_data:
        # Step 1: Convert Markdown to standard HTML
        standard_html = markdown.markdown(
            update_data["content_md"], extensions=['extra']
        )
        # Step 2: Add WeChat inline styles with theme
        update_data["content_html"] = convert_to_wechat_html(standard_html, theme)

    for key, value in update_data.items():
        setattr(db_article, key, value)

    db_article.updated_at = datetime.now()
    db.commit()
    db.refresh(db_article)

    return db_article


@router.post("/articles/{article_id}/publish")
async def publish_article_api(article_id: int, db: Session = Depends(get_db)):
    """
    Create draft in WeChat Official Account
    Note: Subscription accounts (订阅号) do not have freepublish API permission.
    This endpoint only creates a draft. Users need to manually publish via WeChat platform.
    """
    db_article = db.query(Article).filter(Article.id == article_id).first()
    if not db_article:
        raise HTTPException(status_code=404, detail="Article not found")

    # Validation
    if not db_article.title or not db_article.author:
        raise HTTPException(status_code=400, detail="Title and author are required")

    # For now, allow publishing without cover (will fail at WeChat API if required)
    # if not db_article.thumb_media_id:
    #     raise HTTPException(status_code=400, detail="Cover image is required")

    if not db_article.content_html:
        raise HTTPException(status_code=400, detail="Content is required. Please save the article first.")

    try:
        # Step 1: Process content images - upload to WeChat
        processed_html = process_content_images(db_article.content_html, article_id, db)

        # Step 2: Create draft (always recreate to update content)
        draft_media_id = create_draft(
            title=db_article.title,
            author=db_article.author,
            digest=db_article.digest or "",
            thumb_media_id=db_article.thumb_media_id,
            content=processed_html,
            media_ids=[]
        )
        db_article.draft_media_id = draft_media_id
        db_article.status = "synced"
        db_article.updated_at = datetime.now()
        db.commit()

        # Step 2: Publish draft (COMMENTED OUT - Subscription account limitation)
        # NOTE: Subscription accounts do not have freepublish/submit API permission
        # Only Service accounts (服务号) can use this API
        # Users with subscription accounts need to manually publish via WeChat Official Account Platform
        #
        # publish_id = publish_article(db_article.draft_media_id)
        #
        # # Update status
        # db_article.publish_id = publish_id
        # db_article.status = "publishing"
        # db_article.published_at = datetime.now()
        # db_article.updated_at = datetime.now()
        # db.commit()
        # db.refresh(db_article)

        return {
            "success": True,
            "draft_media_id": db_article.draft_media_id,
            "message": "Draft created successfully. Please login to WeChat Official Account Platform to manually publish."
        }

    except Exception as e:
        # Update error status
        db_article.status = "failed"
        db_article.error_msg = str(e)
        db_article.updated_at = datetime.now()
        db.commit()

        raise HTTPException(status_code=500, detail=f"Failed to create draft: {str(e)}")


@router.get("/themes")
async def get_themes():
    """Get available themes"""
    themes = get_available_themes()
    return [
        {
            "id": theme,
            **get_theme_info(theme)
        }
        for theme in themes
    ]


@router.post("/articles/preview-html")
async def preview_html(data: dict):
    """
    Convert Markdown to WeChat HTML for preview/copy
    Does not require article to be saved
    """
    markdown_content = data.get("content_md", "")
    theme = data.get("theme", "default")

    if not markdown_content:
        raise HTTPException(status_code=400, detail="content_md is required")

    try:
        # Step 1: Convert Markdown to standard HTML
        standard_html = markdown.markdown(markdown_content, extensions=['extra'])
        # Step 2: Add WeChat inline styles with theme
        wechat_html = convert_to_wechat_html(standard_html, theme)

        return {
            "html": wechat_html,
            "theme": theme
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")


@router.delete("/articles/{article_id}")
async def delete_article(article_id: int, db: Session = Depends(get_db)):
    """Delete article"""
    db_article = db.query(Article).filter(Article.id == article_id).first()
    if not db_article:
        raise HTTPException(status_code=404, detail="Article not found")

    db.delete(db_article)
    db.commit()

    return {"success": True, "message": "Article deleted"}
