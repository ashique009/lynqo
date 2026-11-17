import uuid
import secrets
from datetime import timedelta
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.conf import settings
from django.utils import timezone


class User(AbstractUser):
    full_name = models.CharField(max_length=255, blank=True, default='')
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=30, blank=True, null=True)

    is_email_verified = models.BooleanField(default=False)
    is_phone_verified = models.BooleanField(default=False)
    is_banned = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_seen = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.username


class Interest(models.Model):
    name = models.CharField(max_length=100, unique=True)
    category = models.CharField(max_length=100, blank=True, null=True)

    def __str__(self):
        return self.name


class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile')
    profile_id = models.CharField(max_length=32, unique=True, db_index=True, blank=True)
    display_name = models.CharField(max_length=100, default='')
    profile_picture = models.ImageField(upload_to='profile_pics/', blank=True, null=True)
    recovery_code_hash = models.CharField(max_length=255, blank=True, default='')
    recovery_code_created_at = models.DateTimeField(null=True, blank=True)
    city = models.CharField(max_length=100, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.display_name or self.profile_id or self.user.username}'s Profile"

    @classmethod
    def generate_unique_profile_id(cls):
        """Generate short unique uppercase profile ID: LYNQ-XXXXX"""
        alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
        while True:
            suffix = "".join(secrets.choice(alphabet) for _ in range(5))
            candidate = f"LYNQ-{suffix}"
            if not cls.objects.filter(profile_id=candidate).exists():
                return candidate


class ProfileSession(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile_sessions')
    token = models.CharField(max_length=64, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)
    user_agent = models.TextField(blank=True, default='')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Session({self.user.username}, active={self.is_active})"

    @classmethod
    def create_session(cls, user, request=None):
        token = secrets.token_urlsafe(32)
        user_agent = ''
        ip_address = None
        if request:
            user_agent = request.META.get('HTTP_USER_AGENT', '')[:500]
            ip_address = request.META.get('REMOTE_ADDR')
        return cls.objects.create(
            user=user,
            token=token,
            user_agent=user_agent,
            ip_address=ip_address,
            is_active=True
        )


class ConnectRequest(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('declined', 'Declined'),
        ('cancelled', 'Cancelled'),
    )

    REASON_CHOICES = (
        ('similar_interests', "We have similar interests."),
        ('be_friends', "I'd like to be friends."),
        ('know_better', "I'd like to know you better."),
    )

    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='sent_requests')
    receiver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='received_requests')
    reason = models.CharField(max_length=50, choices=REASON_CHOICES, blank=True, default='be_friends')
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='pending', db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['sender', 'status']),
            models.Index(fields=['receiver', 'status']),
        ]

    def __str__(self):
        return f"{self.sender.username} → {self.receiver.username} ({self.status})"


class Conversation(models.Model):
    participant_1 = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='conversations_as_p1')
    participant_2 = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='conversations_as_p2')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('participant_1', 'participant_2')
        indexes = [
            models.Index(fields=['participant_1', 'participant_2']),
            models.Index(fields=['updated_at']),
            models.Index(fields=['participant_1', '-updated_at']),
            models.Index(fields=['participant_2', '-updated_at']),
        ]

    def __str__(self):
        return f"Conversation: {self.participant_1.username} & {self.participant_2.username}"

    @classmethod
    def get_or_create_between(cls, user_a, user_b):
        p1, p2 = (user_a, user_b) if user_a.id < user_b.id else (user_b, user_a)
        conv, created = cls.objects.get_or_create(participant_1=p1, participant_2=p2)
        return conv, created

    def get_other_participant(self, user):
        if self.participant_1_id == user.id:
            return self.participant_2
        return self.participant_1


class Message(models.Model):
    STATUS_CHOICES = (
        ('sending', 'Sending'),
        ('sent', 'Sent'),
        ('delivered', 'Delivered'),
        ('seen', 'Seen'),
    )

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='sent_messages')
    client_message_id = models.CharField(max_length=64, blank=True, null=True, db_index=True)
    content = models.TextField(blank=True, default='')
    message_type = models.CharField(max_length=10, choices=(('text', 'Text'), ('voice', 'Voice')), default='text')
    audio_file = models.FileField(upload_to='voice_messages/', blank=True, null=True)
    duration_seconds = models.PositiveIntegerField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='sent', db_index=True)
    is_read = models.BooleanField(default=False)
    is_edited = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['conversation', 'created_at']),
            models.Index(fields=['client_message_id']),
            models.Index(fields=['conversation', 'status']),
            models.Index(fields=['conversation', 'is_read']),
        ]

    def __str__(self):
        return f"{self.sender.username}: {self.content[:30] if self.content else '[media]'}"


class PasswordResetToken(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reset_tokens')
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(minutes=30)
        super().save(*args, **kwargs)

    def is_valid(self):
        return not self.is_used and timezone.now() < self.expires_at


class PushSubscription(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='push_subscriptions')
    endpoint = models.URLField(max_length=500)
    p256dh_key = models.CharField(max_length=255)
    auth_key = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'endpoint')


class TypingStatus(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='typing_statuses')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('conversation', 'user')


class EmailOTP(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='email_otps')
    otp_code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(minutes=10)
        super().save(*args, **kwargs)

    def is_valid(self):
        return not self.is_used and timezone.now() < self.expires_at
