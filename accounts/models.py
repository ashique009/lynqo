from django.db import models
from django.contrib.auth.models import AbstractUser
from django.conf import settings
import uuid
from django.utils import timezone
from datetime import timedelta
from cloudinary_storage.storage import RawMediaCloudinaryStorage

class User(AbstractUser):
    full_name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=15, unique=True)

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
    profile_picture = models.ImageField(upload_to='profile_pics/', storage=RawMediaCloudinaryStorage(), blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username}'s Profile"

    @property
    def profile_completion(self):
        fields_to_check = {
            'Photo': bool(self.profile_picture),
            'City': bool(self.city),
        }

        completed = sum(1 for value in fields_to_check.values() if value)
        total = len(fields_to_check)
        percentage = int((completed / total) * 100)

        return {
            'breakdown': fields_to_check,
            'completed_count': completed,
            'total_count': total,
            'percentage': percentage
        }

#connect request model
class ConnectRequest(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('declined', 'Declined'),
    )

    REASON_CHOICES = (
        ('similar_interests', "We have similar interests."),
        ('be_friends', "I'd like to be friends."),
        ('know_better', "I'd like to know you better."),
    )

    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='sent_requests')
    receiver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='received_requests')
    reason = models.CharField(max_length=30, choices=REASON_CHOICES)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.sender.username} → {self.receiver.username} ({self.status})"
    

#conversation model
class Conversation(models.Model):
    participant_1 = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='conversations_as_p1')
    participant_2 = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='conversations_as_p2')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('participant_1', 'participant_2')

    def __str__(self):
        return f"Conversation: {self.participant_1.username} & {self.participant_2.username}"
    
class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='sent_messages')
    content = models.TextField(blank=True, null=True)
    message_type = models.CharField(max_length=10, choices=(('text', 'Text'), ('voice', 'Voice')), default='text')
    audio_file = models.FileField(upload_to='voice_messages/', storage=RawMediaCloudinaryStorage(), blank=True, null=True)
    duration_seconds = models.PositiveIntegerField(blank=True, null=True)
    is_read = models.BooleanField(default=False)
    is_edited = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"{self.sender.username}: {self.content[:30] if self.content else '[voice message]'}"
    
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