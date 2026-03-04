# gelyu.com

Personal website with public pages and a protected vault, powered by Firebase Hosting + FastAPI on Google Cloud Run.

## Architecture

```
Browser → Firebase Hosting (static HTML from frontend/)
              ├── /about.html, /contact.html       (public, no auth)
              ├── /vault.html                       (requires Google sign-in + allowlist)
              ├── /vault/{slug}                     (sub-vault detail, rewritten to vault-detail.html)
              └── /api/**  →  Cloud Run (FastAPI, us-west1)
                                   ├── Firebase Admin SDK (verify ID tokens)
                                   └── Firestore (allowlist/{email}, users/{uid}, sub_vaults/{id})
```

- **Frontend**: Plain HTML + JS, Firebase Auth (Google sign-in), served by Firebase Hosting
- **Backend**: FastAPI (Python), containerized, deployed to Cloud Run
- **Auth**: Firebase Auth JS SDK on client → Firebase ID token → Backend verifies token + checks Firestore allowlist
- **Access control**: Admin users can create sub-vaults and grant/revoke per-user access (read/write) via access groups stored in the allowlist
- **Hosting rewrite**: `/api/**` requests are proxied by Firebase Hosting to Cloud Run (same-origin, no CORS issues); `/vault/**` is rewritten to `vault-detail.html`

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
│   ├── vault.html           # Protected - sub-vault listing (sign-in + allowlist)
│   ├── vault-detail.html    # Protected - sub-vault detail page
│   ├── 404.html             # Custom 404 page
│   ├── dev_server.py        # Local dev server with Firebase-style rewrites
│   ├── css/
│   │   ├── styles.css       # Global styles
│   │   └── vault.css        # Vault + sub-vault page styles
│   ├── js/
│   │   ├── firebase-init.js # Firebase config + initialization
│   │   ├── auth.js          # Google sign-in/out, token management
│   │   ├── shared-loader.js # Loads shared header/footer into pages
│   │   ├── vault.js         # Vault listing page (sub-vault cards, admin create form)
│   │   └── vault-detail.js  # Sub-vault detail page (content, admin settings)
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
│       ├── access.py        # Access group logic (grant/revoke per resource)
│       ├── models.py        # Pydantic request/response models
│       └── routers/
│           ├── health.py    # GET /api/health
│           ├── vault.py     # GET /api/vault/access (protected)
│           └── sub_vault.py # Sub-vault CRUD + access management (admin)
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

In a separate terminal, use the included dev server which handles Firebase-style URL rewrites (e.g. `/vault/{slug}` → `vault-detail.html`):

```bash
python frontend/dev_server.py
```

This starts a local server on `http://localhost:5001` with the same rewrite rules as Firebase Hosting. The frontend JS automatically detects `localhost` and sends API requests to `http://localhost:8080` (the backend started in step 3).

> **Note:** Do not use `python -m http.server` — it cannot handle the `/vault/{slug}` rewrites and will return 404 for sub-vault detail pages.

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
| `make deploy-backend` | Build container and deploy backend to Cloud Run |
| `make deploy-frontend` | Deploy frontend to Firebase Hosting |
| `make deploy` | Deploy both (backend first, then frontend) |
| `make disable-backend` | Disable backend (zero traffic to Cloud Run) |
| `make disable-frontend` | Disable frontend (replace site with maintenance page) |
| `make disable` | Disable both backend and frontend |
| `make enable-backend` | Re-enable backend (restore traffic to latest revision) |
| `make enable-frontend` | Re-enable frontend (redeploy from `frontend/`) |
| `make enable` | Re-enable both |

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

# 4. Grant Cloud Build permission to push images and write logs
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SA}" \
    --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SA}" \
    --role="roles/logging.logWriter"
```

### One-Time Firebase Setup

1. **Enable Google sign-in**: Firebase Console > Authentication > Sign-in method > Google > Enable
2. **Create Firestore allowlist entry**: Firebase Console > Firestore Database > Create collection `allowlist` > Add document:
   - Document ID: `iamgelyu@gmail.com` (your email)
   - Field `status`: `"active"` (string)
3. **Get Web API Key**: Firebase Console > Project Settings > General > Web API Key → update `frontend/js/firebase-init.js`
4. **Authorize custom domains for Auth**: Firebase Console > Authentication > Settings > Authorized domains > Add `www.gelyu.com` and `gelyu.com`
5. **Add OAuth redirect URI**: Google Cloud Console > APIs & Services > Credentials > Edit the Web OAuth 2.0 Client ID > Add `https://www.gelyu.com/__/auth/handler` to Authorized redirect URIs

### Deploy

```bash
make deploy            # Deploy both (backend first, then frontend)

# Or individually:
make deploy-backend    # Build container + deploy to Cloud Run
make deploy-frontend   # Deploy to Firebase Hosting
```

Note: Backend must be deployed first (Cloud Run service must exist for the Firebase Hosting rewrite to work). `make deploy` handles this order automatically.

The Cloud Run service uses `--allow-unauthenticated` because Firebase Hosting proxies requests to it. The application-level auth (Firebase ID token verification) provides the actual security.

## Custom Domain Setup (Migration from GitHub Pages)

The site was previously hosted on GitHub Pages with a `CNAME` file. Follow these steps in order to migrate to Firebase Hosting with minimal downtime.

### Step 1: Verify Firebase Hosting works on the default URL

After running `make deploy`, visit the default Firebase URL to confirm the site works:
- `https://project-c243fac2-f8de-4142-8aa.web.app`

### Step 2: Add custom domain in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/) > Hosting
2. Click **Add custom domain**
3. Enter `www.gelyu.com`
4. Firebase will show a **TXT record** for domain ownership verification — add it at your domain registrar
5. Wait for Firebase to verify ownership (can be instant or take a few minutes)
6. Firebase will then show **A records** (typically two IP addresses) — note these for Step 3
7. Optionally repeat for the apex domain `gelyu.com`

### Step 3: Update DNS records (Namecheap)

1. Log in to [Namecheap](https://www.namecheap.com/) > **Domain List** > click **Manage** next to `gelyu.com`
2. Go to the **Advanced DNS** tab
3. Delete the existing **CNAME Record** with host `www` pointing to `<username>.github.io`
4. Add the CNAME record Firebase provided in Step 2:
   - Click **Add New Record** > Type: `CNAME Record`, Host: `www`, Value: `<value from Firebase>`, TTL: Automatic
5. If you added the apex domain (`gelyu.com`), Firebase will provide **A records** for `@` (apex domains cannot use CNAME)
6. Keep the TXT record from Step 2
7. Namecheap DNS updates typically propagate within 5–30 minutes

### Step 4: Disable GitHub Pages

1. Go to the GitHub repo > **Settings** > **Pages**
2. Set source to **"None"** (or simply delete the repo if it's only used for hosting)
3. This ensures GitHub stops trying to serve the domain

### Step 5: Wait for DNS propagation and SSL

- DNS propagation typically takes minutes to a few hours (up to 48 hours in rare cases)
- You can check progress: `dig www.gelyu.com` — look for the Firebase A record IPs
- Firebase **automatically provisions a free SSL certificate** once DNS verification succeeds
- The Firebase Console Hosting page will show the domain status as **"Connected"** when ready

### Troubleshooting

- **Site shows GitHub 404 after DNS change**: DNS is still propagating. Wait and retry.
- **SSL certificate pending**: Firebase needs DNS to fully resolve before provisioning SSL. Can take up to 24 hours.
- **Both GitHub and Firebase serving intermittently**: Normal during DNS propagation. Once propagation completes, all traffic goes to Firebase.

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

Controls who can access protected pages and which sub-vaults they can see.

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"active"` or `"revoked"` |
| `role` | string | `"admin"` for admin users (optional) |
| `access_group` | map | `{ sub_vault_doc_id: "read" \| "write", ... }` |
| `added_at` | timestamp | When the entry was created |
| `note` | string | Optional description |

### `users/{uid}`

Auto-created when an allowlisted user accesses the vault.

| Field | Type | Description |
|-------|------|-------------|
| `email` | string | User's email |
| `name` | string | User's display name |
| `last_login` | timestamp | Last vault access time |

### `sub_vaults/{id}`

Sub-vault containers created by admins.

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name |
| `slug` | string | URL-safe identifier (unique) |
| `description` | string | Optional description |
| `created_at` | timestamp | Server-generated creation time |
| `created_by` | string | Email of the admin who created it |

## Testing Checklist

### Local testing

```bash
# Terminal 1: start backend
make run

# Terminal 2: start frontend with rewrite support
python frontend/dev_server.py
```

Then open `http://localhost:5001/vault.html` in a browser.

### After deployment, verify:

- [ ] `curl https://www.gelyu.com/api/health` returns `{"status":"ok"}`
- [ ] `curl https://www.gelyu.com/api/vault/access` returns 401 (no token)
- [ ] Public pages load without sign-in: `/about.html`, `/contact.html`
- [ ] "Sign In" button appears in the header
- [ ] Google sign-in popup works
- [ ] After sign-in, header shows email + "Sign Out" button
- [ ] Vault page with allowlisted account: shows sub-vault cards
- [ ] Vault page with non-allowlisted account: shows "Access Denied" (403)
- [ ] Sign out: vault page shows "Sign in required"
- [ ] **Admin**: "+ Create Sub-Vault" button visible on vault page
- [ ] **Admin**: Can create a sub-vault (card appears in list)
- [ ] **Admin**: Sub-vault detail page shows "Settings" button
- [ ] **Admin**: Can grant/revoke access to other users via Settings
- [ ] **Non-admin**: No create button on vault page, no settings on detail page
- [ ] **Non-admin**: Can only see sub-vaults they have access to
- [ ] Sub-vault detail page accessible via `/vault/{slug}` URL
- [ ] Firestore `users/{uid}` document created after vault access
- [ ] `https://www.gelyu.com` resolves to Firebase Hosting (not GitHub Pages)
