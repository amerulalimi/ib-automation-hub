"""Upload scheduled-post images to S3-compatible object storage (AWS S3, MinIO, R2, etc.)."""
from __future__ import annotations

import re
import uuid
from typing import Optional
from urllib.parse import quote

import boto3
from botocore.exceptions import ClientError, ParamValidationError

from config import (
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_REGION,
    S3_ENDPOINT_URL,
    S3_PUBLIC_BASE_URL,
    S3_SCHEDULED_MEDIA_BUCKET,
)

_ALLOWED_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
}
_MAX_BYTES = 5 * 1024 * 1024
_S3_BUCKET_NAME_RE = re.compile(r"^[a-zA-Z0-9.\-_]{1,255}$")
# https://PROJECT_REF.storage.supabase.co/storage/v1/s3 — public reads use PROJECT_REF.supabase.co/.../public/BUCKET
_SUPABASE_S3_ENDPOINT_RE = re.compile(
    r"^https?://([a-z0-9]+)\.storage\.supabase\.co/storage/v1/s3/?$",
    re.IGNORECASE,
)


def _bucket_name_valid(name: str) -> bool:
    return bool(name and _S3_BUCKET_NAME_RE.match(name))


def is_configured() -> bool:
    return bool(
        AWS_ACCESS_KEY_ID
        and AWS_SECRET_ACCESS_KEY
        and S3_SCHEDULED_MEDIA_BUCKET
    )


def configured_or_raise() -> None:
    from fastapi import HTTPException

    if not is_configured():
        raise HTTPException(
            status_code=503,
            detail=(
                "S3 storage is not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, "
                "and S3_SCHEDULED_MEDIA_BUCKET. Optional: AWS_REGION, S3_ENDPOINT_URL (MinIO/R2), "
                "S3_PUBLIC_BASE_URL (public HTTPS URL prefix for Telegram; required for many custom endpoints)."
            ),
        )


def extension_for_content_type(content_type: str) -> Optional[str]:
    ct = (content_type or "").split(";")[0].strip().lower()
    return _ALLOWED_TYPES.get(ct)


def _resolve_public_base_url() -> Optional[str]:
    """
    HTTPS prefix for object URLs (Telegram sendPhoto). Explicit S3_PUBLIC_BASE_URL wins.
    If unset and endpoint is Supabase S3, derive .../object/public/{bucket} from bucket env
    so it cannot drift from S3_SCHEDULED_MEDIA_BUCKET.
    """
    base = (S3_PUBLIC_BASE_URL or "").strip().rstrip("/")
    if base:
        return base
    ep = (S3_ENDPOINT_URL or "").strip().rstrip("/")
    bn = (S3_SCHEDULED_MEDIA_BUCKET or "").strip()
    if not ep or not bn:
        return None
    m = _SUPABASE_S3_ENDPOINT_RE.match(ep)
    if not m:
        return None
    ref = m.group(1)
    bucket_seg = quote(bn, safe="")
    return f"https://{ref}.supabase.co/storage/v1/object/public/{bucket_seg}"


def _s3_client():
    kwargs = {
        "aws_access_key_id": AWS_ACCESS_KEY_ID,
        "aws_secret_access_key": AWS_SECRET_ACCESS_KEY,
        "region_name": AWS_REGION or "us-east-1",
    }
    if S3_ENDPOINT_URL:
        kwargs["endpoint_url"] = S3_ENDPOINT_URL
    return boto3.client("s3", **kwargs)


def _public_https_url(object_key: str) -> str:
    """Build URL Telegram can fetch (must be https://)."""
    key_enc = quote(object_key, safe="/")
    bucket = S3_SCHEDULED_MEDIA_BUCKET
    base = _resolve_public_base_url()
    if base:
        return f"{base}/{key_enc}"
    if S3_ENDPOINT_URL:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=500,
            detail=(
                "S3_ENDPOINT_URL is set but no public URL could be resolved. "
                "Set S3_PUBLIC_BASE_URL to the public HTTPS base where objects are readable "
                "(e.g. Supabase .../object/public/YOUR_BUCKET, CloudFront, R2 public URL), "
                "or use a Supabase S3 endpoint URL so the app can derive it from S3_SCHEDULED_MEDIA_BUCKET."
            ),
        )
    region = AWS_REGION or "us-east-1"
    if region == "us-east-1":
        host = f"{bucket}.s3.amazonaws.com"
    else:
        host = f"{bucket}.s3.{region}.amazonaws.com"
    return f"https://{host}/{key_enc}"


def upload_scheduled_post_image(
    file_bytes: bytes,
    content_type: str,
    owner_key: str,
) -> str:
    """
    Upload bytes to the configured bucket. Returns a public HTTPS URL for Telegram sendPhoto.
    """
    from fastapi import HTTPException

    configured_or_raise()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(file_bytes) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 5 MB or smaller")
    ext = extension_for_content_type(content_type)
    if not ext:
        raise HTTPException(
            status_code=400,
            detail="Allowed types: JPEG, PNG, GIF, WebP",
        )

    safe_owner = "".join(c for c in (owner_key or "user") if c.isalnum() or c in "-_")[:80] or "user"
    object_key = f"{safe_owner}/{uuid.uuid4()}.{ext}"
    ct = content_type.split(";")[0].strip() or "application/octet-stream"

    bn = S3_SCHEDULED_MEDIA_BUCKET
    if not _bucket_name_valid(bn):
        raise HTTPException(
            status_code=400,
            detail=(
                "S3_SCHEDULED_MEDIA_BUCKET is not a valid S3 bucket id (letters, numbers, dots, hyphens, "
                "underscores only; no spaces). Rename your Supabase Storage bucket to something like "
                "`ib-hub-automation` and set S3_SCHEDULED_MEDIA_BUCKET and S3_PUBLIC_BASE_URL to match."
            ),
        )

    client = _s3_client()
    try:
        client.put_object(
            Bucket=bn,
            Key=object_key,
            Body=file_bytes,
            ContentType=ct,
        )
    except ParamValidationError as e:
        raise HTTPException(
            status_code=400,
            detail="Invalid S3 parameters (often the bucket name). Use a valid bucket id without spaces.",
        ) from e
    except ClientError as e:
        err = e.response.get("Error", {}) if e.response else {}
        code = err.get("Code", "ClientError")
        msg = err.get("Message", str(e))
        raise HTTPException(
            status_code=502,
            detail=f"S3 upload failed ({code}): {msg}",
        ) from e

    url = _public_https_url(object_key)
    if not url.startswith("https://"):
        raise HTTPException(
            status_code=500,
            detail="Configured public URL must use https:// for Telegram.",
        )
    return url
