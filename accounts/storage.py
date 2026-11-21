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
        name_str = str(name or '').lower()
        base_name = os.path.basename(name_str)

        # Profile avatars are explicitly public for user profile discovery
        is_avatar = 'profile_pics' in name_str or 'avatar' in name_str

        # Voice recordings and private chat media are authenticated for privacy
        is_private_chat = (
            'chat_images' in name_str
            or 'chat_thumbnails' in name_str
            or 'lynqo_chat' in name_str
            or 'lynqo_voice' in name_str
            or 'voice_' in base_name
            or resource_type == 'video'
        )

        if is_private_chat and not is_avatar:
            options['type'] = 'authenticated'
        else:
            options['type'] = 'upload'

        folder = os.path.dirname(name)
        if folder:
            options['folder'] = folder
        return cloudinary.uploader.upload(content, **options)
