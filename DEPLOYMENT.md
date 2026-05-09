# DocuMind AI Deployment

This project deploys cleanly as two services:

- Backend: FastAPI Docker service on Render
- Frontend: Vite static app on Vercel

## 1. Push To GitHub

Create a GitHub repository and push this project.

```bash
git init
git add .
git commit -m "Prepare DocuMind AI for deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/documind-ai.git
git push -u origin main
```

## 2. Deploy Backend On Render

Use Render Blueprint deployment:

1. Open Render.
2. Choose **New +** > **Blueprint**.
3. Connect the GitHub repo.
4. Render will read `render.yaml`.
5. Set backend environment variables:

```env
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
CORS_ORIGINS=https://your-frontend-domain.vercel.app
```

The backend Dockerfile installs Tesseract OCR, so image/scanned PDF OCR works in production.

Render will expose a backend URL similar to:

```text
https://documind-ai-api.onrender.com
```

Backend health check:

```text
https://documind-ai-api.onrender.com/api/health
```

## 3. Deploy Frontend On Vercel

1. Open Vercel.
2. Import the same GitHub repo.
3. Set root directory to `frontend`.
4. Set environment variables:

```env
VITE_API_BASE=https://documind-ai-api.onrender.com/api
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```

5. Deploy.

## 4. Update Google OAuth

In Google Cloud Console, add these authorized JavaScript origins:

```text
http://localhost:5173
http://127.0.0.1:5173
https://your-frontend-domain.vercel.app
```

## 5. Update Render CORS After Frontend Deploy

After Vercel gives you the final frontend URL, update Render:

```env
CORS_ORIGINS=https://your-frontend-domain.vercel.app
```

Then redeploy the backend.

## Notes

- SQLite database and uploads are stored on Render persistent disk at `/app/storage`.
- Free Render services may sleep after inactivity, so the first request can be slow.
- For a larger production version, move from SQLite to PostgreSQL and S3-compatible object storage.
