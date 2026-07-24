from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from .models import Profile, Interest, ConnectRequest, Conversation, Message
from django.db import models
User = get_user_model()

#signup serializer
class SignupSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    confirm_password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['full_name', 'username', 'email', 'phone', 'password', 'confirm_password']

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Username already taken.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email already registered.")
        return value

    def validate_phone(self, value):
        if User.objects.filter(phone=value).exists():
            raise serializers.ValidationError("Phone number already registered.")
        return value

    def validate(self, data):
        if data['password'] != data['confirm_password']:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return data

    def create(self, validated_data):
        validated_data.pop('confirm_password')
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

#login serializer
class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField()   # email or username
    password = serializers.CharField(write_only=True)

#interest serializer
class InterestSerializer(serializers.ModelSerializer):
    class Meta:
        model = Interest
        fields = ['id', 'name', 'category']

#profile serializer
class ProfileSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    full_name = serializers.CharField(source='user.full_name', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True)
    interests = InterestSerializer(many=True, read_only=True)
    interest_ids = serializers.PrimaryKeyRelatedField(
        queryset=Interest.objects.all(), many=True, write_only=True, source='interests', required=False
    )
    profile_completion = serializers.ReadOnlyField()

    class Meta:
        model = Profile
        fields = [
            'id', 'username', 'full_name', 'email', 'phone',
            'profile_picture', 'bio', 'address', 'city', 'state',
            'pincode', 'date_of_birth', 'gender', 'looking_for',
            'interests', 'interest_ids', 'profile_completion',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

    def validate_interest_ids(self, value):
        if value and len(value) > 0:
            if len(value) < 3:
                raise serializers.ValidationError("Please select at least 3 interests.")
            if len(value) > 10:
                raise serializers.ValidationError("You can select a maximum of 10 interests.")
        return value

        
#connect request serializer
class ConnectRequestSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source='sender.username', read_only=True)
    receiver_username = serializers.CharField(source='receiver.username', read_only=True)
    reason_display = serializers.CharField(source='get_reason_display', read_only=True)

    class Meta:
        model = ConnectRequest
        fields = [
            'id', 'sender', 'sender_username',
            'receiver', 'receiver_username',
            'reason', 'reason_display', 'status',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['sender', 'status', 'created_at', 'updated_at']

    def validate(self, data):
        request = self.context['request']
        sender = request.user
        receiver = data.get('receiver')

        # Rule 1: Self-request avoid cheyyuka
        if sender == receiver:
            raise serializers.ValidationError("You cannot send a connect request to yourself.")

        # Rule 2: Duplicate pending request avoid cheyyuka
        if ConnectRequest.objects.filter(sender=sender, receiver=receiver, status='pending').exists():
            raise serializers.ValidationError("You already have a pending request with this user.")

        # Rule 3: Already connected (accepted) request undenkil, puthu request avoid cheyyuka
        already_connected = ConnectRequest.objects.filter(
            (models.Q(sender=sender, receiver=receiver) | models.Q(sender=receiver, receiver=sender)),
            status='accepted'
        ).exists()
        if already_connected:
            raise serializers.ValidationError("You are already connected with this user.")

        return data
#message serializer   
class MessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source='sender.username', read_only=True)

    class Meta:
        model = Message
        fields = ['id', 'conversation', 'sender', 'sender_username', 'content', 'is_read', 'is_edited', 'is_deleted', 'created_at']
        read_only_fields = ['sender', 'is_read', 'is_edited', 'is_deleted', 'created_at']

    def validate_content(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Message cannot be empty.")
        return value
#conversation serializer
class ConversationSerializer(serializers.ModelSerializer):
    other_participant = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ['id', 'other_participant', 'last_message', 'created_at', 'updated_at']

    def get_other_participant(self, obj):
        request = self.context.get('request')
        current_user = request.user
        other_user = obj.participant_2 if obj.participant_1 == current_user else obj.participant_1
        return {
            'id': other_user.id,
            'username': other_user.username,
            'full_name': other_user.full_name
        }

    def get_last_message(self, obj):
        last_msg = obj.messages.order_by('-created_at').first()
        if last_msg:
            return {
                'content': last_msg.content,
                'sender': last_msg.sender.username,
                'created_at': last_msg.created_at
            }
        return None
        

class AdminUserListSerializer(serializers.ModelSerializer):
    profile_picture = serializers.SerializerMethodField()
    city = serializers.SerializerMethodField()
    gender = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'full_name', 'email', 'phone',
            'profile_picture', 'gender', 'city',
            'is_banned', 'is_staff', 'date_joined'
        ]

    def get_profile_picture(self, obj):
        if hasattr(obj, 'profile') and obj.profile.profile_picture:
            return obj.profile.profile_picture.url
        return None

    def get_city(self, obj):
        if hasattr(obj, 'profile'):
            return obj.profile.city
        return None

    def get_gender(self, obj):
        if hasattr(obj, 'profile'):
            return obj.profile.gender
        return None