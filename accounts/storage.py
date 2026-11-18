import os
import logging
from cloudinary_storage.storage import MediaCloudinaryStorage
import cloudinary.uploader

logger = logging.getLogger(__name__)


class AdaptiveCloudinaryStorage(MediaCloudinaryStorage):
    """
    Adaptive Cloudinary storage backend that routes files to their proper Cloudinary resource_type:
    - 'video' for audio files (webm, mp3, mp4, ogg, wav, aac, m4a, opus, etc.) and voice message storage
    - 'image' for profile avatars, pictures with image extensions, and extensionless Cloudinary public IDs
    """
    AUDIO_EXTENSIONS = {
        'webm', 'mp3', 'mp4', 'ogg', 'wav', 'aac', 'm4a', 'flac',
        'mov', 'avi', 'mkv', 'opus', 'oga', 'weba'
    }
    IMAGE_EXTENSIONS = {
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic'
    }

    def _get_resource_type(self, name):
        name_str = str(name or '').lower()
        ext = os.path.splitext(name_str)[1].lstrip('.')
        # Voice recordings and audio files must use video resource type in Cloudinary
        if ext in self.AUDIO_EXTENSIONS or 'lynqo_voice' in name_str or 'voice_' in os.path.basename(name_str):
            return 'video'
        # Default all profile avatars, images, and stored Cloudinary public IDs to 'image'
        return 'image'

    def _upload(self, name, content):
        resource_type = self._get_resource_type(name)
        options = {
            'use_filename': True,
            'resource_type': resource_type,
            'tags': self.TAG,
        }
        # Voice recordings are authenticated for privacy; avatars are public
        if resource_type == 'video' or 'lynqo_voice' in str(name) or 'voice_' in os.path.basename(str(name)):
            options['type'] = 'authenticated'
        else:
            options['type'] = 'upload'

        folder = os.path.dirname(name)
        if folder:
            options['folder'] = folder
        return cloudinary.uploader.upload(content, **options)
