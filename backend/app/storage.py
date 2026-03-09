"""Cloud Storage signed URL utilities for media upload and download."""

import datetime

import google.auth
import google.auth.transport.requests
from google.cloud import storage

from app.dependencies import get_settings

_client = None


def _get_client():
    global _client
    if _client is None:
        settings = get_settings()
        _client = storage.Client(project=settings.gcp_project_id)
    return _client


def _get_bucket():
    settings = get_settings()
    return _get_client().bucket(settings.gcs_bucket)


def _signing_kwargs():
    """Return extra kwargs for signed URL generation.

    When gcs_service_account_email is set (local dev with user ADC),
    use the IAM signBlob API. Otherwise (Cloud Run), the default SA signs directly.
    """
    settings = get_settings()
    if settings.gcs_service_account_email:
        credentials, _ = google.auth.default()
        credentials.refresh(google.auth.transport.requests.Request())
        return {
            "service_account_email": settings.gcs_service_account_email,
            "access_token": credentials.token,
        }
    return {}


def generate_upload_url(storage_path: str, content_type: str) -> str:
    """Generate a signed PUT URL for direct browser upload (15-min TTL)."""
    blob = _get_bucket().blob(storage_path)
    return blob.generate_signed_url(
        version="v4",
        expiration=datetime.timedelta(minutes=15),
        method="PUT",
        content_type=content_type,
        **_signing_kwargs(),
    )


def generate_download_url(storage_path: str) -> str:
    """Generate a signed GET URL for media download (30-min TTL)."""
    blob = _get_bucket().blob(storage_path)
    return blob.generate_signed_url(
        version="v4",
        expiration=datetime.timedelta(minutes=30),
        method="GET",
        **_signing_kwargs(),
    )


def delete_blob(storage_path: str) -> None:
    """Delete a blob from storage. Ignores NotFound."""
    blob = _get_bucket().blob(storage_path)
    try:
        blob.delete()
    except Exception:
        pass
