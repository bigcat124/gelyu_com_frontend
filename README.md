# gelyu.com

Personal website with public pages and a protected vault, powered by Firebase Hosting + FastAPI on Google Cloud Run.

## Architecture

```
Browser → Firebase Hosting (static HTML from frontend/)
              ├── /about.html, /contact.html       (public, no auth)
              ├── /vault.html                       (requires Google sign-in + allowlist)
              └── /api/**  →  Cloud Run (FastAPI, us-west1)
                                   ├── Firebase Admin SDK (verify ID tokens)
                                   └── Firestore (allowlist/{email}, users/{uid})
```

- **Frontend**: Plain HTML + JS, Firebase Auth (Google sign-in), served by Firebase Hosting
- **Backend**: FastAPI (Python), containerized, deployed to Cloud Run
- **Auth**: Firebase Auth JS SDK on client → Firebase ID token → Backend verifies token + checks Firestore allowlist
- **Hosting rewrite**: `/api/**` requests are proxied by Firebase Hosting to Cloud Run (same-origin, no CORS issues)

## Project Structure

```
/
├── firebase.json            # Firebase Hosting config (public dir, rewrites, headers)
├── .firebaserc              # Firebase project binding
├── Makefile                 # Conda env + dependency management
├── README.md
│
├── frontend/                # Static files served by Firebase Hosting
│   ├── index.html           # Redirects to about.html
│   ├── about.html           # Public - About Me page
│   ├── contact.html         # Public - Contact page
│   ├── vault.html           # Protected - requires sign-in + allowlist
│   ├── 404.html             # Custom 404 page
│   ├── css/
│   │   ├── styles.css       # Global styles
│   │   └── vault.css        # Vault page styles
│   ├── js/
│   │   ├── firebase-init.js # Firebase config + initialization
│   │   ├── auth.js          # Google sign-in/out, token management
│   │   ├── shared-loader.js # Loads shared header/footer into pages
│   │   └── vault.js         # Vault page logic (auth check, API call)
│   ├── shared/
│   │   ├── header.html      # Shared nav bar (includes auth button)
│   │   └── footer.html      # Shared footer
│   └── images/
│       └── IMG_1042.png     # Profile photo
│
├── backend/                 # FastAPI service (deployed to Cloud Run)
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── .env.example         # Documents required env vars
│   └── app/
│       ├── main.py          # FastAPI app, CORS, rate limiting
│       ├── config.py        # Settings (from env vars)
│       ├── dependencies.py  # Firebase Admin SDK + Firestore init
│       ├── auth.py          # Token verification + allowlist check
│       └── routers/
│           ├── health.py    # GET /api/health
│           └── vault.py     # GET /api/vault/access (protected)
```

## Prerequisites

- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud`)
- [Firebase CLI](https://firebase.google.com/docs/cli) (`firebase`)
- [Conda](https://docs.conda.io/en/latest/miniconda.html) (Miniconda or Anaconda)
- [Docker](https://docs.docker.com/get-docker/) (for building the backend container)

## Local Development

### 1. Set up the Python environment

```bash
make create    # Creates conda env "gelyu" with Python 3.12
make install   # Installs backend dependencies from backend/requirements.txt
```

### 2. Configure Firebase (one-time)

1. Go to [Firebase Console](https://console.firebase.google.com/) > Project Settings > General
2. Copy the **Web API Key**
3. Edit `frontend/js/firebase-init.js` and replace `YOUR_FIREBASE_WEB_API_KEY` with it

### 3. Run the backend locally

For local development, authenticate using Application Default Credentials (ADC):

```bash
gcloud auth application-default login --project project-c243fac2-f8de-4142-8aa
```

This opens a browser for Google sign-in and stores credentials locally. The Firebase Admin SDK picks them up automatically — no service account key file needed.

Run the backend:

```bash
make run
```

The API will be available at `http://localhost:8080`. Test it:

```bash
curl http://localhost:8080/api/health
# Should return: {"status":"ok"}
```

### 4. Serve the frontend locally

In a separate terminal:

```bash
cd frontend
python -m http.server 5001
```

Visit `http://localhost:5001/about.html`. Note: The `/api/**` rewrite only works when deployed to Firebase Hosting. For local frontend testing, the vault page API calls will fail unless you configure a local proxy.

### Cleanup

```bash
make clean     # Removes the conda environment
```

## Makefile Targets

| Target | Description |
|--------|-------------|
| `make create` | Create conda environment `gelyu` with Python 3.12 |
| `make install` | Install backend dependencies into the conda environment |
| `make clean` | Remove the conda environment |
| `make run` | Run the backend locally with uvicorn (auto-reload) |

## Deployment

### One-Time GCP Setup

```bash
PROJECT_ID="project-c243fac2-f8de-4142-8aa"

# 1. Enable required APIs
gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com \
    firestore.googleapis.com \
    secretmanager.googleapis.com \
    --project=${PROJECT_ID}

# 2. Create Artifact Registry repository
gcloud artifacts repositories create gelyu-api \
    --repository-format=docker \
    --location=us-west1 \
    --project=${PROJECT_ID}

# 3. Grant Cloud Run service account required roles
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SA}" \
    --role="roles/datastore.user"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SA}" \
    --role="roles/firebase.sdkAdminServiceAgent"
```

### One-Time Firebase Setup

1. **Enable Google sign-in**: Firebase Console > Authentication > Sign-in method > Google > Enable
2. **Create Firestore allowlist entry**: Firebase Console > Firestore Database > Create collection `allowlist` > Add document:
   - Document ID: `iamgelyu@gmail.com` (your email)
   - Field `status`: `"active"` (string)
3. **Get Web API Key**: Firebase Console > Project Settings > General > Web API Key → update `frontend/js/firebase-init.js`

### Deploy Backend (Cloud Run)

```bash
PROJECT_ID="project-c243fac2-f8de-4142-8aa"
IMAGE="us-west1-docker.pkg.dev/${PROJECT_ID}/gelyu-api/gelyu-api"

# Build and push the container image
cd backend
gcloud builds submit --tag "${IMAGE}" --project=${PROJECT_ID}

# Deploy to Cloud Run
gcloud run deploy gelyu-api \
    --image="${IMAGE}" \
    --region=us-west1 \
    --platform=managed \
    --allow-unauthenticated \
    --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},ALLOWED_ORIGINS=https://www.gelyu.com;https://gelyu.com" \
    --min-instances=0 \
    --max-instances=3 \
    --memory=256Mi \
    --cpu=1 \
    --timeout=30 \
    --project=${PROJECT_ID}
```

Note: `--allow-unauthenticated` is required because Firebase Hosting proxies requests to Cloud Run. The application-level auth (Firebase ID token verification) provides the actual security.

### Deploy Frontend (Firebase Hosting)

```bash
# From repo root
firebase deploy --only hosting --project project-c243fac2-f8de-4142-8aa
```

### Deployment Order

1. Deploy **backend** first (Cloud Run service must exist for the hosting rewrite to work)
2. Deploy **frontend** second (Firebase Hosting)

## Custom Domain Setup (Migration from GitHub Pages)

The site was previously hosted on GitHub Pages with a `CNAME` file. To migrate to Firebase Hosting:

1. **Remove GitHub Pages**: Go to the GitHub repo > Settings > Pages > Set source to "None" (or delete the CNAME record)
2. **Add custom domain in Firebase**: Firebase Console > Hosting > Add custom domain
   - Add `www.gelyu.com`
   - Optionally add `gelyu.com` (apex domain)
3. **Update DNS records** at your domain registrar:
   - Firebase will provide the required A and/or AAAA records
   - Remove any existing CNAME pointing to `<username>.github.io`
   - Add the records Firebase provides
4. **Wait for DNS propagation** (can take up to 48 hours, usually much faster)
5. **SSL certificate**: Firebase automatically provisions an SSL certificate once DNS verification succeeds

## Environment Variables

### Backend (Cloud Run)

| Variable | Description | Example |
|----------|-------------|---------|
| `GCP_PROJECT_ID` | Google Cloud project ID | `project-c243fac2-f8de-4142-8aa` |
| `ALLOWED_ORIGINS` | CORS allowed origins (semicolon-separated) | `https://www.gelyu.com;https://gelyu.com` |
| `PORT` | Server port (auto-set by Cloud Run) | `8080` |

### Frontend (public config, not secrets)

| Value | File | Notes |
|-------|------|-------|
| Firebase Web API Key | `frontend/js/firebase-init.js` | Public — safe in client code |
| Firebase Auth Domain | `frontend/js/firebase-init.js` | Public |
| Firebase Project ID | `frontend/js/firebase-init.js` | Public |

No service account key files are needed in production — Cloud Run uses Application Default Credentials (ADC).

## Firestore Data Model

### `allowlist/{email}`

Controls who can access protected pages.

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"active"` or `"revoked"` |
| `added_at` | timestamp | When the entry was created |
| `note` | string | Optional description |

### `users/{uid}`

Auto-created when an allowlisted user accesses the vault.

| Field | Type | Description |
|-------|------|-------------|
| `email` | string | User's email |
| `name` | string | User's display name |
| `last_login` | timestamp | Last vault access time |

## Testing Checklist

After deployment, verify:

- [ ] `curl https://www.gelyu.com/api/health` returns `{"status":"ok"}`
- [ ] `curl https://www.gelyu.com/api/vault/access` returns 401 (no token)
- [ ] Public pages load without sign-in: `/about.html`, `/contact.html`
- [ ] "Sign In" button appears in the header
- [ ] Google sign-in popup works
- [ ] After sign-in, header shows email + "Sign Out" button
- [ ] Vault page with allowlisted account: shows vault content
- [ ] Vault page with non-allowlisted account: shows "Access Denied" (403)
- [ ] Sign out: vault page shows "Sign in required"
- [ ] Firestore `users/{uid}` document created after vault access
- [ ] `https://www.gelyu.com` resolves to Firebase Hosting (not GitHub Pages)
