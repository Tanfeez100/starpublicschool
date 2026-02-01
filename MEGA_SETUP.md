# MEGA Setup

## Required env
Create a `.env` file in project root (same folder as `package.json`):

```env
MEGA_EMAIL=your-mega-email@example.com
MEGA_PASSWORD=your-mega-password

# Optional folder paths inside your MEGA account
MEGA_PRIVATE_FOLDER_PATH=private
MEGA_PUBLIC_FOLDER_PATH=public
```

Notes:
- Backend will auto-create `private/` and `public/` folders if missing.
- If `public=true`, API returns a MEGA share link. If `public=false`, it uploads privately and returns `url: null`.

## API (Postman)
- `POST /api/mega/images?public=false`
- `POST /api/mega/images?public=true`
- `POST /api/mega/images/bulk?public=false|true`
- `GET /api/mega/images?public=false|true&includeLinks=true`
- `DELETE /api/mega/images/:nodeId`

Multipart field name: `image` (also accepts `file`).


