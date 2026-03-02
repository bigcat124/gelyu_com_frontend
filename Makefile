ENV_NAME = gelyu
PYTHON_VERSION = 3.12

.PHONY: create install clean run

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
