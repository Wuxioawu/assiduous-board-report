from io import BytesIO

from PIL import Image, UnidentifiedImageError

ALLOWED_AVATAR_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


def process_avatar_image(raw: bytes, *, dimension: int) -> bytes:
    """Center-crops to a square and resizes to dimension x dimension, re-encoded as a
    JPEG - keeps stored avatars small and a consistent shape regardless of what the
    user uploaded. Raises ValueError if `raw` isn't a decodable image (a spoofed
    Content-Type header would otherwise sail through the content-type check alone)."""
    try:
        # verify() cheaply validates the file is a real, undamaged image, but leaves
        # the Image object unusable afterwards - a fresh open() is required to
        # actually process it.
        Image.open(BytesIO(raw)).verify()
        image = Image.open(BytesIO(raw)).convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("File is not a valid image") from exc

    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    image = image.crop((left, top, left + side, top + side))
    image = image.resize((dimension, dimension), Image.LANCZOS)

    out = BytesIO()
    image.save(out, format="JPEG", quality=85)
    return out.getvalue()
