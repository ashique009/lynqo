import os
from cloudinary_storage.storage import MediaCloudinaryStorage
import cloudinary.uploader

class AdaptiveCloudinaryStorage(MediaCloudinaryStorage):
    """
    Adaptive Cloudinary storage backend that routes files to their proper Cloudinary resource_type:
    - 'video' for audio files (webm, mp3, mp4, ogg, wav, aac, m4a, opus, etc.)
    - 'image' for images (png, jpg, webp, etc.)
    - 'raw' for documents and other binary files
    """
    AUDIO_EXTENSIONS = {
        'webm', 'mp3', 'mp4', 'ogg', 'wav', 'aac', 'm4a', 'flac',
        'mov', 'avi', 'mkv', 'opus', 'oga', 'weba'
    }
    IMAGE_EXTENSIONS = {
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic'
    }

    def _get_resource_type(self, name):
        ext = os.path.splitext(name)[1].lower().lstrip('.')
        if ext in self.AUDIO_EXTENSIONS:
            return 'video'
        elif ext in self.IMAGE_EXTENSIONS:
            return 'image'
        return 'raw'

    def _upload(self, name, content):
        resource_type = self._get_resource_type(name)
        options = {
            'use_filename': True,
            'resource_type': resource_type,
            'tags': self.TAG,
        }
        # Voice messages are authenticated assets for privacy
        if resource_type in ('video', 'raw') or 'voice_' in name:
            options['type'] = 'authenticated'

        folder = os.path.dirname(name)
        if folder:
            options['folder'] = folder
        return cloudinary.uploader.upload(content, **options)
