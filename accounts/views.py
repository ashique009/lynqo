from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate, get_user_model
from django.db import models

from .serializers import (
    SignupSerializer, LoginSerializer, ProfileSerializer,
    InterestSerializer, ConnectRequestSerializer,
    ConversationSerializer, MessageSerializer
)
from .models import Profile, Interest, ConnectRequest, Conversation, Message
from .utils import success_response

User = get_user_model()

#signup view
class SignupView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return success_response(
            message="Signup successful",
            data={"token": token.key, "username": user.username},
            status_code=status.HTTP_201_CREATED
        )

#login view
class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        identifier = serializer.validated_data['identifier']
        password = serializer.validated_data['password']

        user_obj = User.objects.filter(email=identifier).first() or \
                   User.objects.filter(username=identifier).first()

        if user_obj is None:
            return success_response(message="Invalid credentials", data=None, status_code=status.HTTP_400_BAD_REQUEST)

        user = authenticate(username=user_obj.username, password=password)

        if user is None:
            return success_response(message="Invalid credentials", data=None, status_code=status.HTTP_400_BAD_REQUEST)

        token, _ = Token.objects.get_or_create(user=user)
        return success_response(
            message="Login successful",
            data={"token": token.key, "username": user.username},
            status_code=status.HTTP_200_OK
        )

#logout view
class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        request.user.auth_token.delete()
        return success_response(message="Logout successful", data=None, status_code=status.HTTP_200_OK)

#profile create view
class ProfileCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if Profile.objects.filter(user=request.user).exists():
            return success_response(message="Profile already exists", data=None, status_code=status.HTTP_400_BAD_REQUEST)

        serializer = ProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return success_response(message="Profile created successfully", data=serializer.data, status_code=status.HTTP_201_CREATED)

#Profile detail view
class ProfileDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            profile = Profile.objects.get(user=request.user)
        except Profile.DoesNotExist:
            return success_response(message="Profile not found", data=None, status_code=status.HTTP_404_NOT_FOUND)

        serializer = ProfileSerializer(profile)
        return success_response(message="Profile fetched successfully", data=serializer.data, status_code=status.HTTP_200_OK)

#profile update view
class ProfileUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def put(self, request):
        try:
            profile = Profile.objects.get(user=request.user)
        except Profile.DoesNotExist:
            return success_response(message="Profile not found", data=None, status_code=status.HTTP_404_NOT_FOUND)

        serializer = ProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(message="Profile updated successfully", data=serializer.data, status_code=status.HTTP_200_OK)

#interest list view
class InterestListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        interests = Interest.objects.all()
        serializer = InterestSerializer(interests, many=True)
        return success_response(message="Interests fetched successfully", data=serializer.data, status_code=status.HTTP_200_OK)

#connect request views
class SendConnectRequestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ConnectRequestSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save(sender=request.user)
        return success_response(message="Connect request sent", data=serializer.data, status_code=status.HTTP_201_CREATED)

#pending and sent requests views
class PendingRequestsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        requests_qs = ConnectRequest.objects.filter(receiver=request.user, status='pending')
        serializer = ConnectRequestSerializer(requests_qs, many=True)
        return success_response(message="Pending requests fetched", data=serializer.data, status_code=status.HTTP_200_OK)


class SentRequestsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        requests_qs = ConnectRequest.objects.filter(sender=request.user)
        serializer = ConnectRequestSerializer(requests_qs, many=True)
        return success_response(message="Sent requests fetched", data=serializer.data, status_code=status.HTTP_200_OK)

#accept and decline connect request views
class AcceptConnectRequestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        request_id = request.data.get('request_id')
        try:
            connect_request = ConnectRequest.objects.get(id=request_id, receiver=request.user, status='pending')
        except ConnectRequest.DoesNotExist:
            return success_response(message="Request not found or already handled.", data=None, status_code=status.HTTP_404_NOT_FOUND)

        connect_request.status = 'accepted'
        connect_request.save()

        # Automatic aayi Conversation create cheyyuka (already illenkil mathram)
        user_a = connect_request.sender
        user_b = connect_request.receiver

        conversation = Conversation.objects.filter(
            models.Q(participant_1=user_a, participant_2=user_b) |
            models.Q(participant_1=user_b, participant_2=user_a)
        ).first()

        if not conversation:
            Conversation.objects.create(participant_1=user_a, participant_2=user_b)

        serializer = ConnectRequestSerializer(connect_request)
        return success_response(message="Request accepted", data=serializer.data, status_code=status.HTTP_200_OK)

#decline connect request view
class DeclineConnectRequestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        request_id = request.data.get('request_id')
        try:
            connect_request = ConnectRequest.objects.get(id=request_id, receiver=request.user, status='pending')
        except ConnectRequest.DoesNotExist:
            return success_response(message="Request not found or already handled.", data=None, status_code=status.HTTP_404_NOT_FOUND)

        connect_request.status = 'declined'
        connect_request.save()
        serializer = ConnectRequestSerializer(connect_request)
        return success_response(message="Request declined", data=serializer.data, status_code=status.HTTP_200_OK)

#suggestions view
class SuggestionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            my_profile = Profile.objects.get(user=request.user)
        except Profile.DoesNotExist:
            return success_response(message="Please complete your profile first.", data=None, status_code=status.HTTP_400_BAD_REQUEST)

        # Already connected/pending users exclude cheyyuka
        connected_or_pending_ids = ConnectRequest.objects.filter(
            models.Q(sender=request.user) | models.Q(receiver=request.user),
            status__in=['pending', 'accepted']
        ).values_list('sender_id', 'receiver_id')

        exclude_ids = {request.user.id}
        for sender_id, receiver_id in connected_or_pending_ids:
            exclude_ids.add(sender_id)
            exclude_ids.add(receiver_id)

        # Base queryset — self and already interacted users mathram exclude cheyyuka
        base_queryset = Profile.objects.exclude(user_id__in=exclude_ids)

        # Ippo, strict filter apply cheythu try cheyyuka (best match)
        filtered = base_queryset
        if my_profile.city:
            filtered = filtered.filter(city__iexact=my_profile.city)
        if my_profile.looking_for:
            filtered = filtered.filter(looking_for=my_profile.looking_for)

        my_interest_ids = my_profile.interests.values_list('id', flat=True)
        if my_interest_ids:
            filtered = filtered.filter(interests__id__in=my_interest_ids).distinct()

        # Users kuranjathu kondu (early-stage app), strict match onnum illenkil,
        # base queryset (ella remaining users-um) fallback aayi kaanikkuka
        if filtered.exists():
            suggestions = filtered
        else:
            suggestions = base_queryset

        serializer = ProfileSerializer(suggestions, many=True)
        return success_response(message="Suggestions fetched successfully", data=serializer.data, status_code=status.HTTP_200_OK)

class ConversationListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        conversations = Conversation.objects.filter(
            models.Q(participant_1=request.user) | models.Q(participant_2=request.user)
        ).order_by('-updated_at')
        serializer = ConversationSerializer(conversations, many=True, context={'request': request})
        return success_response(message="Conversations fetched successfully", data=serializer.data, status_code=status.HTTP_200_OK)

#conversation detail view
class ConversationDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, conversation_id):
        try:
            conversation = Conversation.objects.get(
                models.Q(id=conversation_id),
                models.Q(participant_1=request.user) | models.Q(participant_2=request.user)
            )
        except Conversation.DoesNotExist:
            return success_response(message="Conversation not found.", data=None, status_code=status.HTTP_404_NOT_FOUND)

        serializer = ConversationSerializer(conversation, context={'request': request})
        return success_response(message="Conversation fetched successfully", data=serializer.data, status_code=status.HTTP_200_OK)

#send message view
class SendMessageView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        conversation_id = request.data.get('conversation_id')
        content = request.data.get('content')

        # Rule: Conversation exist cheyyunnundo
        try:
            conversation = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            return success_response(message="Conversation not found.", data=None, status_code=status.HTTP_404_NOT_FOUND)

        # Rule: Sender conversation-il participant aayirikkanam
        if request.user != conversation.participant_1 and request.user != conversation.participant_2:
            return success_response(message="You are not part of this conversation.", data=None, status_code=status.HTTP_403_FORBIDDEN)

        # Rule: Empty message reject cheyyuka
        if not content or not content.strip():
            return success_response(message="Message cannot be empty.", data=None, status_code=status.HTTP_400_BAD_REQUEST)

        message = Message.objects.create(conversation=conversation, sender=request.user, content=content.strip())

        # Conversation-inte updated_at refresh cheyyuka (latest activity kaanikkaan)
        conversation.save()

        serializer = MessageSerializer(message)
        return success_response(message="Message sent", data=serializer.data, status_code=status.HTTP_201_CREATED)

#get messages view
class GetMessagesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, conversation_id):
        try:
            conversation = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            return success_response(message="Conversation not found.", data=None, status_code=status.HTTP_404_NOT_FOUND)

        # Rule: User conversation-il participant aayirikkanam
        if request.user != conversation.participant_1 and request.user != conversation.participant_2:
            return success_response(message="You are not part of this conversation.", data=None, status_code=status.HTTP_403_FORBIDDEN)

        # Read status update cheyyuka — current user allathe sender ayacha messages "read" aakkuka
        Message.objects.filter(conversation=conversation, is_read=False).exclude(sender=request.user).update(is_read=True)

        messages = conversation.messages.all()  # already ordered by created_at (oldest -> newest)
        serializer = MessageSerializer(messages, many=True)
        return success_response(message="Messages fetched successfully", data=serializer.data, status_code=status.HTTP_200_OK)


