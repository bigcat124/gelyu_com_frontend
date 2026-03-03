ENV_NAME = gelyu
PYTHON_VERSION = 3.12
PROJECT_ID = project-c243fac2-f8de-4142-8aa
REGION = us-west1
SERVICE_NAME = gelyu-api
IMAGE = $(REGION)-docker.pkg.dev/$(PROJECT_ID)/$(SERVICE_NAME)/$(SERVICE_NAME)

.PHONY: create install clean run deploy-backend deploy-frontend deploy \
	disable-backend disable-frontend disable enable-backend enable-frontend enable

## Create conda environment
create:
	conda create -n $(ENV_NAME) python=$(PYTHON_VERSION) -y

## Install backend dependencies into the conda environment
install:
	conda run -n $(ENV_NAME) pip install -r backend/requirements.txt

## Remove the conda environment
clean:
	conda env remove -n $(ENV_NAME) -y

## Run the backend locally
run:
	cd backend && conda run -n $(ENV_NAME) uvicorn app.main:app --reload --port 8080

## Build and deploy backend to Cloud Run
deploy-backend:
	cd backend && gcloud builds submit --tag $(IMAGE) --project=$(PROJECT_ID)
	gcloud run deploy $(SERVICE_NAME) \
		--image=$(IMAGE) \
		--region=$(REGION) \
		--platform=managed \
		--allow-unauthenticated \
		--set-env-vars="GCP_PROJECT_ID=$(PROJECT_ID),ALLOWED_ORIGINS=https://www.gelyu.com;https://gelyu.com" \
		--min-instances=0 \
		--max-instances=3 \
		--memory=256Mi \
		--cpu=1 \
		--timeout=30 \
		--project=$(PROJECT_ID)

## Deploy frontend to Firebase Hosting
deploy-frontend:
	firebase deploy --only hosting --project $(PROJECT_ID)

## Deploy both backend and frontend (backend first)
deploy: deploy-backend deploy-frontend

## Disable backend (set Cloud Run to serve no traffic)
disable-backend:
	gcloud run services update-traffic $(SERVICE_NAME) \
		--to-revisions=LATEST=0 \
		--region=$(REGION) \
		--project=$(PROJECT_ID)

## Disable frontend (deploy a maintenance page)
disable-frontend:
	@mkdir -p .maintenance
	@echo '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Ge Lyu - Maintenance</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#003d5c 0%,#663399 100%);color:#fff;text-align:center}h1{font-weight:300;font-size:2.5rem;margin-bottom:1rem}p{opacity:.8;font-size:1.1rem}</style></head><body><div><h1>Under Maintenance</h1><p>The site is temporarily offline for updates. Please check back soon.</p></div></body></html>' > .maintenance/index.html
	firebase hosting:channel:deploy maintenance --only hosting --project $(PROJECT_ID) --expires 7d
	firebase hosting:clone $(PROJECT_ID):maintenance $(PROJECT_ID):live --project $(PROJECT_ID)
	@rm -rf .maintenance

## Disable both backend and frontend
disable: disable-backend disable-frontend

## Re-enable backend (restore traffic to latest revision)
enable-backend:
	gcloud run services update-traffic $(SERVICE_NAME) \
		--to-latest \
		--region=$(REGION) \
		--project=$(PROJECT_ID)

## Re-enable frontend (redeploy from frontend/ directory)
enable-frontend: deploy-frontend

## Re-enable both
enable: enable-backend enable-frontend
