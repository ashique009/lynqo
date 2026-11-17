import os
import uuid
from PIL import Image
from django.core.exceptions import ValidationError

MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}
ALLOWED_FORMATS = {'JPEG', 'PNG', 'WEBP'}

def validate_and_sanitize_image(image_file):
    """
    Validates file size, extension, and verifies that the file is an authentic
    image using Pillow. Generates a secure uuid-based filename.
    """
    if not image_file:
        return image_file

    if image_file.size > MAX_UPLOAD_SIZE:
        raise ValidationError("Image file too large. Maximum size is 5MB.")

    _, ext = os.path.splitext(image_file.name)
    ext = ext.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValidationError(f"Unsupported image format '{ext}'. Allowed formats: JPG, PNG, WebP.")

    # Validate image structure with Pillow
    try:
        image_file.seek(0)
        img = Image.open(image_file)
        img.verify()
        if img.format.upper() not in ALLOWED_FORMATS:
            raise ValidationError(f"Image format {img.format} is not supported. Use JPG, PNG, or WebP.")
        image_file.seek(0)
    except Exception as e:
        if isinstance(e, ValidationError):
            raise
        raise ValidationError("Uploaded file is not a valid or readable image.")

    # Assign secure random filename
    norm_ext = '.jpg' if ext == '.jpeg' else ext
    image_file.name = f"{uuid.uuid4().hex}{norm_ext}"
    return image_file
