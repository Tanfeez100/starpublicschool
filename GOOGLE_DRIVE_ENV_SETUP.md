## Google Drive connect (Service Account) - .env values

Add these 3 variables to your existing `.env` (same file you already use with `nodemon --env-file=.env`):

```env
GOOGLE_CLIENT_EMAIL=service-account-name@your-project-id.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nPASTE_KEY_HERE...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_FOLDER_ID=YOUR_FOLDER_ID_HERE
```

### If you already downloaded `service-account.json`

You can auto-generate the `.env` lines (copy/paste output):

```bash
node scripts/print-drive-env.js service-account.json
```

### How to create credentials (Service Account)

1) Google Cloud Console → create/select a project  
2) APIs & Services → Library → enable **Google Drive API**  
3) IAM & Admin → Service Accounts → **Create Service Account**  
4) Open it → Keys → **Add Key → Create new key → JSON** (download JSON)  
5) From that JSON:
   - `client_email` → `GOOGLE_CLIENT_EMAIL`
   - `private_key` → `GOOGLE_PRIVATE_KEY` (keep it as one line in `.env` by replacing real newlines with `\n`)

### Folder access (MOST IMPORTANT)

Google Drive folder where you want uploads:

1) Create/open a folder in Drive
2) Share that folder with your service account email (`GOOGLE_CLIENT_EMAIL`) as **Editor**
3) Copy Folder ID from URL:
   - Example URL: `https://drive.google.com/drive/folders/1AbCDefGhIJkLmNopQrStUvWxYz`
   - Folder ID: `1AbCDefGhIJkLmNopQrStUvWxYz`
4) Put it in `GOOGLE_DRIVE_FOLDER_ID`


