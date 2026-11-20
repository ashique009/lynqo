from rest_framework import serializers
from django.utils import timezone
from datetime import timedelta
from .models import Profile, ConnectRequest, Conversation, Message, User
from .validators import validate_and_sanitize_image


class ProfilePublicSerializer(serializers.ModelSerializer):
    profile_id = serializers.CharField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    profile_picture = serializers.SerializerMethodField()
    is_online = serializers.SerializerMethodField()
    last_seen = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = ['profile_id', 'display_name', 'profile_picture', 'is_online', 'last_seen']

    def get_profile_picture(self, obj):
        if obj.profile_picture:
            return obj.profile_picture.url
        return None

    def get_is_online(self, obj):
        try:
            from .consumers import is_user_online
            if is_user_online(obj.user.id):
                return True
        except Exception:
            pass
        return False

    def get_last_seen(self, obj):
        return obj.user.last_seen.isoformat() if obj.user.last_seen else None


class ProfileDetailSerializer(serializers.ModelSerializer):
    profile_id = serializers.CharField(read_only=True)
    display_name = serializers.CharField()
    profile_picture = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Profile
        fields = [
            'profile_id', 'display_name', 'profile_picture',
            'created_at', 'updated_at'
        ]

    def get_profile_picture(self, obj):
        if obj.profile_picture:
            return obj.profile_picture.url
        return None


class ProfileCreateSerializer(serializers.Serializer):
    display_name = serializers.CharField(min_length=2, max_length=60, trim_whitespace=True)
    username = serializers.CharField(min_length=3, max_length=150, required=False, allow_blank=True)
    password = serializers.CharField(min_length=4, required=False, allow_blank=True)
    profile_picture = serializers.ImageField(required=False, allow_null=True)

    def validate_profile_picture(self, value):
        if value:
            return validate_and_sanitize_image(value)
        return value


class ProfileUpdateSerializer(serializers.Serializer):
    display_name = serializers.CharField(min_length=2, max_length=60, trim_whitespace=True, required=False)
    profile_picture = serializers.ImageField(required=False, allow_null=True)

    def validate_profile_picture(self, value):
        if value:
            return validate_and_sanitize_image(value)
        return value


class ConnectRequestSerializer(serializers.ModelSerializer):
    sender = serializers.SerializerMethodField()
    receiver = serializers.SerializerMethodField()
    status = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = ConnectRequest
        fields = ['id', 'sender', 'receiver', 'reason', 'status', 'created_at']

    def get_sender(self, obj):
        return ProfilePublicSerializer(getattr(obj.sender, 'profile', None)).data

    def get_receiver(self, obj):
        return ProfilePublicSerializer(getattr(obj.receiver, 'profile', None)).data


def format_reply_to_details(orig, user=None):
    if not orig:
        return None
    sender = getattr(orig, 'sender', None)
    sender_profile = getattr(sender, 'profile', None) if sender else None
    sender_pid = sender_profile.profile_id if sender_profile else (sender.username if sender else '')
    sender_dname = sender_profile.display_name if sender_profile else (sender.username if sender else '')

    is_del = getattr(orig, 'is_deleted', False)
    if not is_del and user and user.is_authenticated:
        if hasattr(orig, 'prefetched_deleted_for'):
            is_del = user in orig.prefetched_deleted_for
        elif hasattr(orig, 'deleted_for'):
            try:
                is_del = orig.deleted_for.filter(id=user.id).exists()
            except Exception:
                pass

    if is_del:
        return {
            'id': orig.id,
            'sender_profile_id': sender_pid,
            'sender_display_name': sender_dname,
            'content': '',
            'message_type': orig.message_type,
            'is_deleted': True,
            'thumbnail_url': None,
            'duration_seconds': None,
        }

    thumb_url = None
    if orig.message_type == 'image':
        thumb_url = f"/api/auth/conversations/{orig.conversation_id}/messages/{orig.id}/image/?thumb=1"

    return {
        'id': orig.id,
        'sender_profile_id': sender_pid,
        'sender_display_name': sender_dname,
        'content': orig.content or '',
        'message_type': orig.message_type,
        'thumbnail_url': thumb_url,
        'duration_seconds': getattr(orig, 'duration_seconds', None),
        'is_deleted': False,
    }


class MessageSerializer(serializers.ModelSerializer):
    conversation_id = serializers.IntegerField(read_only=True)
    sender_profile_id = serializers.SerializerMethodField()
    sender_display_name = serializers.SerializerMethodField()
    client_message_id = serializers.CharField(required=False, allow_null=True)
    audio_url = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    thumbnail_url = serializers.SerializerMethodField()
    reply_to_id = serializers.IntegerField(source='reply_to.id', read_only=True, allow_null=True)
    reply_to_details = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            'id', 'client_message_id', 'conversation_id',
            'sender_profile_id', 'sender_display_name',
            'content', 'message_type', 'audio_url', 'image_url', 'thumbnail_url',
            'reply_to_id', 'reply_to_details',
            'image_width', 'image_height', 'duration_seconds',
            'file_size', 'audio_format',
            'status', 'is_read', 'is_edited', 'is_deleted', 'created_at'
        ]
        read_only_fields = ['id', 'status', 'is_read', 'is_edited', 'is_deleted', 'created_at', 'audio_url', 'image_url', 'thumbnail_url', 'reply_to_id', 'reply_to_details']

    def get_sender_profile_id(self, obj):
        profile = getattr(obj.sender, 'profile', None)
        return profile.profile_id if profile else obj.sender.username

    def get_sender_display_name(self, obj):
        profile = getattr(obj.sender, 'profile', None)
        return profile.display_name if profile else obj.sender.username

    def get_audio_url(self, obj):
        if getattr(obj, 'is_deleted', False):
            return None
        if obj.message_type == 'voice' and (obj.audio_file or obj.audio_storage_id):
            return f"/api/auth/conversations/{obj.conversation_id}/messages/{obj.id}/audio/"
        return None

    def get_image_url(self, obj):
        if getattr(obj, 'is_deleted', False):
            return None
        if obj.message_type == 'image' and (obj.image_file or obj.image_storage_id):
            return f"/api/auth/conversations/{obj.conversation_id}/messages/{obj.id}/image/"
        return None

    def get_thumbnail_url(self, obj):
        if getattr(obj, 'is_deleted', False):
            return None
        if obj.message_type == 'image' and (obj.image_thumbnail or obj.image_thumbnail_id or obj.image_file or obj.image_storage_id):
            return f"/api/auth/conversations/{obj.conversation_id}/messages/{obj.id}/image/?thumb=1"
        return None

    def get_reply_to_details(self, obj):
        if not obj.reply_to_id:
            return None
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        return format_reply_to_details(obj.reply_to, user=user)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.is_deleted:
            data['content'] = ''
            data['audio_url'] = None
            data['image_url'] = None
            data['thumbnail_url'] = None
        return data


class ConversationSerializer(serializers.ModelSerializer):
    other_participant = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ['id', 'other_participant', 'last_message', 'unread_count', 'updated_at']

    def get_other_participant(self, obj):
        user = self.context.get('request').user
        other = obj.get_other_participant(user)
        return ProfilePublicSerializer(getattr(other, 'profile', None)).data

    def get_last_message(self, obj):
        if hasattr(obj, 'prefetched_last_message'):
            last_msg = obj.prefetched_last_message
        else:
            last_msg = obj.messages.order_by('-created_at').first()
        if last_msg:
            return MessageSerializer(last_msg).data
        return None

    def get_unread_count(self, obj):
        if hasattr(obj, 'annotated_unread_count'):
            return obj.annotated_unread_count
        user = self.context.get('request').user
        return obj.messages.filter(is_read=False).exclude(sender=user).count()
