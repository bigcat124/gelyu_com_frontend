from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gcp_project_id: str = "project-c243fac2-f8de-4142-8aa"
    allowed_origins: str = "https://www.gelyu.com;https://gelyu.com"
    port: int = 8080
    rate_limit_default: str = "60/minute"
    rate_limit_auth: str = "20/minute"

    model_config = {"env_file": ".env"}
