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
        if obj.user.last_seen:
            return timezone.now() - obj.user.last_seen < timedelta(minutes=2)
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


class MessageSerializer(serializers.ModelSerializer):
    conversation_id = serializers.IntegerField(source='conversation.id', read_only=True)
    sender_profile_id = serializers.SerializerMethodField()
    sender_display_name = serializers.SerializerMethodField()
    client_message_id = serializers.CharField(required=False, allow_null=True)
    audio_url = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            'id', 'client_message_id', 'conversation_id',
            'sender_profile_id', 'sender_display_name',
            'content', 'message_type', 'audio_url', 'duration_seconds',
            'file_size', 'audio_format',
            'status', 'is_read', 'created_at'
        ]
        read_only_fields = ['id', 'status', 'is_read', 'created_at', 'audio_url']

    def get_sender_profile_id(self, obj):
        profile = getattr(obj.sender, 'profile', None)
        return profile.profile_id if profile else obj.sender.username

    def get_sender_display_name(self, obj):
        profile = getattr(obj.sender, 'profile', None)
        return profile.display_name if profile else obj.sender.username

    def get_audio_url(self, obj):
        if obj.message_type == 'voice' and (obj.audio_file or obj.audio_storage_id):
            return f"/api/auth/conversations/{obj.conversation_id}/messages/{obj.id}/audio/"
        return None


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
