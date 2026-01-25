# Good MP Post

WeChat Official Account article publishing system with Web UI and CLI modes.

## Features

- **Dual Modes**: Web UI (recommended) and CLI scripts
- **Article Management**: CRUD operations with SQLite persistence
- **Markdown Support**: Write articles in Markdown format
- **Image Upload**: Upload cover and inline images to WeChat
- **Draft Management**: Create and manage drafts before publishing
- **Publishing**: Publish directly to WeChat Official Account
- **History Tracking**: Database logging of all operations
- **Data Sync**: Scripts and Web UI share the same database

## Quick Start

### 1. Installation

```bash
# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env

# Configure WeChat credentials in .env
# WECHAT_APP_ID=your_app_id
# WECHAT_APP_SECRET=your_app_secret
```

### 2. Run Web UI (Recommended)

```bash
# Start the server
uvicorn app.main:app --reload

# Open browser
http://localhost:8000
```

### 3. Use CLI Scripts

```bash
# Upload image
python scripts/upload_media.py /path/to/image.jpg thumb

# Create draft
python scripts/create_draft.py \
  --title "Article Title" \
  --author "Author" \
  --thumb_media_id <media_id> \
  --content "<p>Content</p>"

# Publish article
python scripts/publish_article.py --media_id <draft_id>
```

## Project Structure

```
good-mp-post/
├── app/
│   ├── main.py              # FastAPI application entry
│   ├── database.py          # Database models and connection
│   ├── api/
│   │   ├── articles.py      # Article CRUD endpoints
│   │   └── images.py        # Image upload endpoints
│   └── static/
│       ├── index.html       # Web UI
│       ├── js/app.js        # Frontend JavaScript
│       └── css/style.css    # Custom styles
├── scripts/
│   ├── wechat_auth.py       # WeChat authentication
│   ├── upload_media.py      # Upload images
│   ├── create_draft.py      # Create drafts
│   ├── publish_article.py   # Publish articles
│   └── db_logger.py         # Database logger (optional)
├── data/
│   └── articles.db          # SQLite database (auto-created)
├── requirements.txt         # Python dependencies
├── .env.example             # Environment template
└── SKILL.md                 # Usage guide
```

## API Endpoints

### Health Check
- `GET /health` - Service health status

### Articles
- `GET /api/articles` - List all articles
- `GET /api/articles/{id}` - Get article by ID
- `POST /api/articles` - Create new article
- `PUT /api/articles/{id}` - Update article
- `DELETE /api/articles/{id}` - Delete article
- `POST /api/articles/{id}/publish` - Publish article to WeChat

### Images
- `POST /api/images/upload` - Upload image to WeChat

## Database Schema

### Articles Table
- `id`: Primary key
- `title`: Article title
- `author`: Author name (max 8 Chinese characters)
- `digest`: Article summary
- `content`: Article content (original)
- `content_md`: Markdown content
- `content_html`: HTML content
- `thumb_media_id`: Cover image media ID
- `thumb_url`: Cover image URL
- `draft_media_id`: Draft media ID (from WeChat)
- `publish_id`: Publish ID (from WeChat)
- `status`: draft | publishing | published
- `error_msg`: Error message if failed
- `created_at`: Creation timestamp
- `updated_at`: Update timestamp
- `published_at`: Publish timestamp

### Images Table
- `id`: Primary key
- `file_path`: Local file path
- `media_id`: WeChat media ID
- `media_type`: thumb | image
- `url`: WeChat URL (if available)
- `created_at`: Upload timestamp

## Configuration

### Environment Variables
- `WECHAT_APP_ID`: WeChat Official Account App ID
- `WECHAT_APP_SECRET`: WeChat Official Account App Secret
- `DATABASE_URL`: SQLite database path (default: sqlite:///./data/articles.db)

### WeChat Setup
1. Go to WeChat Official Account Platform: https://mp.weixin.qq.com
2. Navigate to: Development -> Basic Configuration
3. Copy App ID and App Secret
4. Add your server IP to whitelist

## Important Notes

1. **Author Name Limit**: Maximum 8 Chinese characters
2. **Image Expiry**: Cover images are permanent, inline images expire in 3 days
3. **HTML Requirements**: Use simple tags (p/h1-h3/ul/li/img/a), avoid complex CSS
4. **Publishing Review**: Articles require WeChat review after publishing
5. **Rate Limits**:
   - Image upload: 1000/day
   - Draft creation: 100/day
   - Publishing: 10/day

## License

MIT
