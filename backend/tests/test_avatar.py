from io import BytesIO

import pytest
from PIL import Image

from app.services.avatar import process_avatar_image


def _make_image_bytes(*, width: int, height: int, fmt: str = "PNG", color=(255, 0, 0)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (width, height), color=color).save(buffer, format=fmt)
    return buffer.getvalue()


def test_square_image_is_resized_to_target_dimension():
    raw = _make_image_bytes(width=800, height=800)

    processed = process_avatar_image(raw, dimension=256)

    out = Image.open(BytesIO(processed))
    assert out.size == (256, 256)
    assert out.format == "JPEG"


def test_wide_image_is_center_cropped_to_square_then_resized():
    raw = _make_image_bytes(width=1000, height=400)

    processed = process_avatar_image(raw, dimension=100)

    out = Image.open(BytesIO(processed))
    assert out.size == (100, 100)


def test_tall_image_is_center_cropped_to_square_then_resized():
    raw = _make_image_bytes(width=300, height=900)

    processed = process_avatar_image(raw, dimension=128)

    out = Image.open(BytesIO(processed))
    assert out.size == (128, 128)


def test_center_crop_keeps_the_middle_of_the_image():
    # Left half red, right half blue, on a wide image - a center crop of the
    # square middle should end up roughly balanced between both colors,
    # whereas a bug that crops from the left edge would come out solid red.
    width, height = 400, 200
    image = Image.new("RGB", (width, height))
    for x in range(width):
        color = (255, 0, 0) if x < width // 2 else (0, 0, 255)
        for y in range(height):
            image.putpixel((x, y), color)
    buffer = BytesIO()
    image.save(buffer, format="PNG")

    processed = process_avatar_image(buffer.getvalue(), dimension=50)

    out = Image.open(BytesIO(processed)).convert("RGB")
    colors_present = {out.getpixel((x, 25)) for x in range(50)}
    # JPEG re-encoding introduces slight color drift, so just check both
    # halves of the original image contributed to the crop (a pure left-edge
    # crop would only ever see red).
    reds = [c for c in colors_present if c[0] > c[2]]
    blues = [c for c in colors_present if c[2] > c[0]]
    assert reds and blues


def test_png_input_is_reencoded_as_jpeg():
    raw = _make_image_bytes(width=200, height=200, fmt="PNG")

    processed = process_avatar_image(raw, dimension=64)

    assert Image.open(BytesIO(processed)).format == "JPEG"


def test_webp_input_is_reencoded_as_jpeg():
    raw = _make_image_bytes(width=200, height=200, fmt="WEBP")

    processed = process_avatar_image(raw, dimension=64)

    assert Image.open(BytesIO(processed)).format == "JPEG"


def test_invalid_image_bytes_raise_value_error():
    with pytest.raises(ValueError):
        process_avatar_image(b"this is definitely not an image", dimension=256)


def test_empty_bytes_raise_value_error():
    with pytest.raises(ValueError):
        process_avatar_image(b"", dimension=256)


def test_truncated_image_raises_value_error():
    raw = _make_image_bytes(width=200, height=200, fmt="PNG")
    truncated = raw[: len(raw) // 2]

    with pytest.raises(ValueError):
        process_avatar_image(truncated, dimension=256)
