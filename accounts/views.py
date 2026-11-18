import secrets
import time
import os
import logging
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.contrib.auth.hashers import make_password, check_password
from django.db import transaction, models
from django.http import FileResponse, HttpResponseRedirect
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

logger = logging.getLogger(__name__)

from .auth import SESSION_COOKIE_NAME, invalidate_session_cache
from .models import (
    User, Profile, ProfileSession, ConnectRequest, Conversation, Message
)
from .serializers import (
    ProfileCreateSerializer, ProfileUpdateSerializer, ProfileDetailSerializer,
    ProfilePublicSerializer, ConnectRequestSerializer, ConversationSerializer,
    MessageSerializer
)


def set_session_cookie(response, token):
    samesite = 'None' if not settings.DEBUG else 'Lax'
    secure = not settings.DEBUG
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=365 * 24 * 3600,  # 1 year
        httponly=True,
        samesite=samesite,
        secure=secure,
        path='/'
    )


def clear_session_cookie(response):
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path='/'
    )


def generate_recovery_code(profile_id):
    """
    Format: REC-<suffix>-<8 alphanumeric chars>
    Allows O(1) indexed lookup by suffix + cryptographic hash check.
    """
    suffix = profile_id.split('-')[1]
    alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    code_part = "".join(secrets.choice(alphabet) for _ in range(8))
    return f"REC-{suffix}-{code_part}"


# ============================================================================
# PHASE 2 — PASSWORDLESS PROFILE SYSTEM VIEWS
# ============================================================================

class ProfileCreateView(APIView):
    permission_classes = [permissions.AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        serializer = ProfileCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        display_name = serializer.validated_data['display_name']
        profile_picture = serializer.validated_data.get('profile_picture')

        with transaction.atomic():
            profile_id = Profile.generate_unique_profile_id()
            user = User.objects.create(
                username=profile_id,
                full_name=display_name
            )
            user.set_unusable_password()
            user.save()

            recovery_code = generate_recovery_code(profile_id)
            recovery_code_hash = make_password(recovery_code)

            profile = Profile.objects.create(
                user=user,
                profile_id=profile_id,
                display_name=display_name,
                profile_picture=profile_picture,
                recovery_code_hash=recovery_code_hash,
                recovery_code_created_at=timezone.now()
            )

            session = ProfileSession.create_session(user, request)

        response_data = {
            'success': True,
            'message': 'Profile created successfully.',
            'token': session.token,
            'profile': ProfileDetailSerializer(profile).data,
            'recovery_code': recovery_code,
        }
        response = Response(response_data, status=status.HTTP_201_CREATED)
        set_session_cookie(response, session.token)
        return response


class ProfileRecoverView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        raw_code = (request.data.get('recovery_code') or '').strip().upper()
        if not raw_code:
            return Response(
                {'success': False, 'message': 'Recovery code is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Expected format: REC-<suffix>-<part>
        parts = raw_code.split('-')
        if len(parts) != 3 or parts[0] != 'REC':
            return Response(
                {'success': False, 'message': 'Invalid recovery code format. Expected format: REC-XXXXX-XXXXXXXX'},
                status=status.HTTP_400_BAD_REQUEST
            )

        suffix = parts[1]
        expected_profile_id = f"LYNQ-{suffix}"

        try:
            profile = Profile.objects.select_related('user').get(profile_id=expected_profile_id)
        except Profile.DoesNotExist:
            return Response(
                {'success': False, 'message': 'Invalid recovery code.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not profile.recovery_code_hash or not check_password(raw_code, profile.recovery_code_hash):
            return Response(
                {'success': False, 'message': 'Invalid recovery code.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            # Rotate recovery code (single use!)
            new_recovery_code = generate_recovery_code(profile.profile_id)
            profile.recovery_code_hash = make_password(new_recovery_code)
            profile.recovery_code_created_at = timezone.now()
            profile.save(update_fields=['recovery_code_hash', 'recovery_code_created_at'])

            session = ProfileSession.create_session(profile.user, request)

        response_data = {
            'success': True,
            'message': 'Profile recovered successfully. A new recovery code has been generated.',
            'token': session.token,
            'profile': ProfileDetailSerializer(profile).data,
            'new_recovery_code': new_recovery_code,
        }
        response = Response(response_data, status=status.HTTP_200_OK)
        set_session_cookie(response, session.token)
        return response


class ProfileMeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        profile = getattr(request.user, 'profile', None)
        if not profile:
            return Response(
                {'success': False, 'message': 'Profile not found.'},
                status=status.HTTP_404_NOT_FOUND
            )
        return Response({
            'success': True,
            'profile': ProfileDetailSerializer(profile).data,
        })


class ProfileUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def put(self, request):
        profile = getattr(request.user, 'profile', None)
        if not profile:
            return Response(
                {'success': False, 'message': 'Profile not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = ProfileUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if 'display_name' in serializer.validated_data:
            new_name = serializer.validated_data['display_name']
            profile.display_name = new_name
            request.user.full_name = new_name
            request.user.save(update_fields=['full_name'])

        if 'profile_picture' in serializer.validated_data:
            # Delete old image if new one provided
            if profile.profile_picture:
                profile.profile_picture.delete(save=False)
            profile.profile_picture = serializer.validated_data['profile_picture']

        profile.save()
        if hasattr(request, 'profile_session') and request.profile_session:
            invalidate_session_cache(request.profile_session.token)

        return Response({
            'success': True,
            'message': 'Profile updated successfully.',
            'profile': ProfileDetailSerializer(profile).data,
        })


class ProfileRegenerateRecoveryCodeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        profile = getattr(request.user, 'profile', None)
        if not profile:
            return Response(
                {'success': False, 'message': 'Profile not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        new_recovery_code = generate_recovery_code(profile.profile_id)
        profile.recovery_code_hash = make_password(new_recovery_code)
        profile.recovery_code_created_at = timezone.now()
        profile.save(update_fields=['recovery_code_hash', 'recovery_code_created_at'])

        return Response({
            'success': True,
            'message': 'New recovery code generated successfully. Keep it safe!',
            'recovery_code': new_recovery_code,
        })


class ProfileLogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if hasattr(request, 'profile_session') and request.profile_session:
            request.profile_session.is_active = False
            request.profile_session.save(update_fields=['is_active'])
            invalidate_session_cache(request.profile_session.token)

        response = Response({'success': True, 'message': 'Logged out successfully.'})
        clear_session_cookie(response)
        return response


# ============================================================================
# PHASE 3 — CONNECTION REQUEST SYSTEM VIEWS
# ============================================================================

class ProfileSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = (
            request.query_params.get('query') or
            request.query_params.get('q') or
            request.query_params.get('profile_id') or
            request.query_params.get('name') or
            ''
        ).strip()
        if not query:
            return Response(
                {'success': False, 'message': 'Search query parameter is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        current_profile = getattr(request.user, 'profile', None)
        upper_query = query.upper()
        if current_profile and (current_profile.profile_id == upper_query or current_profile.display_name.lower() == query.lower()):
            return Response(
                {'success': False, 'message': 'You cannot search for your own profile ID.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 1. Check exact profile_id match first
        exact_profile = Profile.objects.select_related('user').exclude(user=request.user).filter(profile_id=upper_query).first()
        if exact_profile:
            conv = Conversation.objects.filter(
                (models.Q(participant_1=request.user, participant_2=exact_profile.user) |
                 models.Q(participant_1=exact_profile.user, participant_2=request.user))
            ).first()

            status_val = 'connected' if conv else 'none'
            conv_id = conv.id if conv else None

            prof_data = ProfilePublicSerializer(exact_profile).data
            prof_data['conversation_id'] = conv_id

            return Response({
                'success': True,
                'profile': prof_data,
                'profiles': [prof_data],
                'connection_status': status_val,
                'request_id': None,
                'conversation_id': conv_id,
            })

        # 2. Search by display name or partial profile_id
        matches = list(Profile.objects.select_related('user').exclude(user=request.user).filter(
            models.Q(display_name__icontains=query) |
            models.Q(profile_id__icontains=upper_query)
        ).order_by('-id')[:25])

        if not matches:
            return Response(
                {'success': False, 'message': f"No profile found with ID or name '{query}'."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Fetch conversation IDs for all matches in one query
        match_user_ids = [p.user.id for p in matches]
        convs = Conversation.objects.filter(
            (models.Q(participant_1=request.user, participant_2_id__in=match_user_ids) |
             models.Q(participant_2=request.user, participant_1_id__in=match_user_ids))
        )
        conv_map = {}
        for c in convs:
            other_id = c.participant_2_id if c.participant_1_id == request.user.id else c.participant_1_id
            conv_map[other_id] = c.id

        results = []
        for p in matches:
            p_data = ProfilePublicSerializer(p).data
            p_data['conversation_id'] = conv_map.get(p.user.id)
            results.append(p_data)

        first_conv = results[0].get('conversation_id') if results else None
        return Response({
            'success': True,
            'profile': results[0] if len(results) == 1 else None,
            'profiles': results,
            'connection_status': 'connected' if first_conv else 'none',
            'request_id': None,
            'conversation_id': first_conv,
        })


class SendConnectRequestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        target_id = (request.data.get('profile_id') or '').strip().upper()
        reason = request.data.get('reason', 'be_friends')

        if not target_id:
            return Response(
                {'success': False, 'message': 'profile_id is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        current_profile = getattr(request.user, 'profile', None)
        if current_profile and current_profile.profile_id == target_id:
            return Response(
                {'success': False, 'message': 'You cannot send a connection request to yourself.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        target_profile = Profile.objects.select_related('user').filter(profile_id=target_id).first()
        if not target_profile:
            return Response(
                {'success': False, 'message': 'Target profile not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        with transaction.atomic():
            # Check existing connection
            existing_req = ConnectRequest.objects.filter(
                (models.Q(sender=request.user, receiver=target_profile.user) |
                 models.Q(sender=target_profile.user, receiver=request.user))
            ).order_by('-created_at').first()

            if existing_req:
                if existing_req.status == 'accepted':
                    return Response(
                        {'success': False, 'message': 'You are already connected with this profile.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                if existing_req.status == 'pending':
                    if existing_req.sender_id == request.user.id:
                        return Response(
                            {'success': False, 'message': 'A connection request has already been sent.'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    else:
                        # Auto-accept if they already sent a request
                        existing_req.status = 'accepted'
                        existing_req.save(update_fields=['status'])
                        conv, _ = Conversation.get_or_create_between(request.user, target_profile.user)
                        return Response({
                            'success': True,
                            'message': 'Connection request accepted automatically.',
                            'connection_status': 'connected',
                            'conversation_id': conv.id,
                        })

            connect_req = ConnectRequest.objects.create(
                sender=request.user,
                receiver=target_profile.user,
                reason=reason,
                status='pending'
            )

        # Notify receiver in real-time
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f"user_{target_profile.user.id}",
                {
                    'type': 'connection_event',
                    'event_type': 'incoming_connect_request',
                    'data': ConnectRequestSerializer(connect_req).data,
                }
            )

        return Response({
            'success': True,
            'message': 'Connection request sent successfully.',
            'request': ConnectRequestSerializer(connect_req).data,
        }, status=status.HTTP_201_CREATED)


class IncomingRequestsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        requests = ConnectRequest.objects.filter(
            receiver=request.user,
            status='pending'
        ).select_related('sender__profile__user', 'receiver__profile__user').order_by('-created_at')
        return Response({
            'success': True,
            'requests': ConnectRequestSerializer(requests, many=True).data,
        })


class OutgoingRequestsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        requests = ConnectRequest.objects.filter(
            sender=request.user,
            status='pending'
        ).select_related('sender__profile__user', 'receiver__profile__user').order_by('-created_at')
        return Response({
            'success': True,
            'requests': ConnectRequestSerializer(requests, many=True).data,
        })


class AcceptConnectRequestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, request_id):
        try:
            connect_req = ConnectRequest.objects.select_related('sender__profile', 'receiver__profile').get(
                id=request_id,
                receiver=request.user
            )
        except ConnectRequest.DoesNotExist:
            return Response(
                {'success': False, 'message': 'Connection request not found or unauthorized.'},
                status=status.HTTP_404_NOT_FOUND
            )

        if connect_req.status != 'pending':
            return Response(
                {'success': False, 'message': f'Request already {connect_req.status}.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            connect_req.status = 'accepted'
            connect_req.save(update_fields=['status'])
            conv, _ = Conversation.get_or_create_between(connect_req.sender, connect_req.receiver)

        # Notify sender in real time
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f"user_{connect_req.sender_id}",
                {
                    'type': 'connection_event',
                    'event_type': 'connect_request_accepted',
                    'data': {
                        'request_id': connect_req.id,
                        'conversation_id': conv.id,
                        'accepted_by': ProfilePublicSerializer(request.user.profile).data,
                    }
                }
            )

        return Response({
            'success': True,
            'message': 'Connection request accepted.',
            'conversation_id': conv.id,
        })


class DeclineConnectRequestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, request_id):
        try:
            connect_req = ConnectRequest.objects.get(
                id=request_id,
                receiver=request.user
            )
        except ConnectRequest.DoesNotExist:
            return Response(
                {'success': False, 'message': 'Connection request not found or unauthorized.'},
                status=status.HTTP_404_NOT_FOUND
            )

        connect_req.status = 'declined'
        connect_req.save(update_fields=['status'])

        return Response({'success': True, 'message': 'Connection request declined.'})


class CancelConnectRequestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, request_id):
        try:
            connect_req = ConnectRequest.objects.get(
                id=request_id,
                sender=request.user
            )
        except ConnectRequest.DoesNotExist:
            return Response(
                {'success': False, 'message': 'Connection request not found or unauthorized.'},
                status=status.HTTP_404_NOT_FOUND
            )

        connect_req.status = 'cancelled'
        connect_req.save(update_fields=['status'])

        return Response({'success': True, 'message': 'Connection request cancelled.'})


class ConnectedProfilesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # All users with whom current_user has active conversations or accepted requests
        convs = Conversation.objects.filter(
            models.Q(participant_1=request.user) | models.Q(participant_2=request.user)
        ).select_related('participant_1__profile', 'participant_2__profile')

        user_map = {}
        for c in convs:
            other_user = c.participant_2 if c.participant_1_id == request.user.id else c.participant_1
            user_map[other_user.id] = {
                'profile': ProfilePublicSerializer(getattr(other_user, 'profile', None)).data,
                'conversation_id': c.id,
                'connected_since': c.created_at.isoformat(),
            }

        # Also include legacy accepted requests if any
        legacy_reqs = ConnectRequest.objects.filter(
            (models.Q(sender=request.user) | models.Q(receiver=request.user)),
            status='accepted'
        ).select_related('sender__profile', 'receiver__profile')

        for req in legacy_reqs:
            other_user = req.receiver if req.sender_id == request.user.id else req.sender
            if other_user.id not in user_map:
                conv, _ = Conversation.get_or_create_between(request.user, other_user)
                user_map[other_user.id] = {
                    'profile': ProfilePublicSerializer(getattr(other_user, 'profile', None)).data,
                    'conversation_id': conv.id,
                    'connected_since': req.updated_at.isoformat(),
                }

        connections = list(user_map.values())
        return Response({'success': True, 'connections': connections})


# ============================================================================
# PHASE 4 — REAL-TIME MESSAGING REST VIEWS
# ============================================================================

class ConversationListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        convs = list(Conversation.objects.filter(
            models.Q(participant_1=request.user) | models.Q(participant_2=request.user)
        ).select_related(
            'participant_1__profile__user', 'participant_2__profile__user'
        ).annotate(
            annotated_unread_count=models.Count(
                'messages',
                filter=models.Q(messages__is_read=False) & ~models.Q(messages__sender=request.user),
                distinct=True
            ),
            last_message_id=models.Subquery(
                Message.objects.filter(conversation=models.OuterRef('pk')).order_by('-created_at', '-id').values('id')[:1]
            )
        ).order_by('-updated_at'))

        # Single batch fetch for all last messages across all conversations (eliminates N+1)
        last_msg_ids = [c.last_message_id for c in convs if c.last_message_id]
        if last_msg_ids:
            messages_by_id = {
                m.id: m for m in Message.objects.filter(id__in=last_msg_ids).select_related('sender__profile')
            }
            for c in convs:
                c.prefetched_last_message = messages_by_id.get(c.last_message_id)
        else:
            for c in convs:
                c.prefetched_last_message = None

        serializer = ConversationSerializer(convs, many=True, context={'request': request})
        return Response({'success': True, 'conversations': serializer.data})

    def post(self, request):
        target_profile_id = (
            request.data.get('profile_id') or
            request.data.get('participant_profile_id') or
            request.data.get('target_profile_id') or
            ''
        ).strip().upper()
        target_user_id = request.data.get('user_id')

        target_user = None
        if target_profile_id:
            profile = Profile.objects.select_related('user').filter(profile_id=target_profile_id).first()
            if profile:
                target_user = profile.user
        elif target_user_id:
            target_user = User.objects.filter(id=target_user_id).first()

        if not target_user:
            return Response(
                {'success': False, 'message': 'Target user or profile not found.'},
                status=status.HTTP_404_NOT_FOUND
            )

        if target_user.id == request.user.id:
            return Response(
                {'success': False, 'message': 'You cannot start a conversation with yourself.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if getattr(target_user, 'is_banned', False):
            return Response(
                {'success': False, 'message': 'Cannot start a conversation with this account.'},
                status=status.HTTP_403_FORBIDDEN
            )

        with transaction.atomic():
            conv, created = Conversation.get_or_create_between(request.user, target_user)

        serializer = ConversationSerializer(conv, context={'request': request})
        return Response({
            'success': True,
            'conversation': serializer.data,
            'created': created
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class ConversationDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, conversation_id):
        try:
            conv = Conversation.objects.select_related(
                'participant_1__profile__user', 'participant_2__profile__user'
            ).annotate(
                annotated_unread_count=models.Count(
                    'messages',
                    filter=models.Q(messages__is_read=False) & ~models.Q(messages__sender=request.user),
                    distinct=True
                ),
                last_message_id=models.Subquery(
                    Message.objects.filter(conversation=models.OuterRef('pk')).order_by('-created_at').values('id')[:1]
                )
            ).get(id=conversation_id)
        except Conversation.DoesNotExist:
            return Response({'success': False, 'message': 'Conversation not found.'}, status=status.HTTP_404_NOT_FOUND)

        if conv.participant_1_id != request.user.id and conv.participant_2_id != request.user.id:
            return Response({'success': False, 'message': 'Unauthorized.'}, status=status.HTTP_403_FORBIDDEN)

        if conv.last_message_id:
            conv.prefetched_last_message = Message.objects.filter(id=conv.last_message_id).select_related('sender__profile').first()
        else:
            conv.prefetched_last_message = None

        serializer = ConversationSerializer(conv, context={'request': request})
        return Response({'success': True, 'conversation': serializer.data})


class MessageListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, conversation_id):
        try:
            conv = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            return Response({'success': False, 'message': 'Conversation not found.'}, status=status.HTTP_404_NOT_FOUND)

        if conv.participant_1_id != request.user.id and conv.participant_2_id != request.user.id:
            return Response({'success': False, 'message': 'Unauthorized.'}, status=status.HTTP_403_FORBIDDEN)

        # Pagination params
        limit = min(int(request.query_params.get('limit', 50)), 100)
        before_id = request.query_params.get('before_id')
        since_id = request.query_params.get('since_id')

        qs = Message.objects.filter(conversation=conv).select_related('sender__profile', 'conversation')

        if before_id:
            qs = qs.filter(id__lt=int(before_id))
        if since_id:
            qs = qs.filter(id__gt=int(since_id))

        raw_messages = list(qs.order_by('-created_at', '-id')[:limit + 1])
        has_more = len(raw_messages) > limit
        messages = list(reversed(raw_messages[:limit]))

        # Mark messages as seen if unread
        unread_ids = [m.id for m in messages if not m.is_read and m.sender_id != request.user.id]
        if unread_ids:
            Message.objects.filter(id__in=unread_ids).update(status='seen', is_read=True)
            for m in messages:
                if m.id in unread_ids:
                    m.status = 'seen'
                    m.is_read = True
            channel_layer = get_channel_layer()
            if channel_layer:
                async_to_sync(channel_layer.group_send)(
                    f"conv_{conv.id}",
                    {
                        'type': 'broadcast_messages_seen',
                        'conversation_id': conv.id,
                        'seen_by_profile_id': request.user.profile.profile_id,
                    }
                )

        return Response({
            'success': True,
            'messages': MessageSerializer(messages, many=True).data,
            'has_more': has_more,
        })


class SendMessageView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, conversation_id):
        try:
            conv = Conversation.objects.select_related('participant_1', 'participant_2').get(id=conversation_id)
        except Conversation.DoesNotExist:
            return Response({'success': False, 'message': 'Conversation not found.'}, status=status.HTTP_404_NOT_FOUND)

        if conv.participant_1_id != request.user.id and conv.participant_2_id != request.user.id:
            return Response({'success': False, 'message': 'Unauthorized.'}, status=status.HTTP_403_FORBIDDEN)

        other_user = conv.get_other_participant(request.user)

        if getattr(request.user, 'is_banned', False) or getattr(other_user, 'is_banned', False):
            return Response({'success': False, 'message': 'Account restricted.'}, status=status.HTTP_403_FORBIDDEN)

        content = (request.data.get('content') or '').strip()
        client_msg_id = request.data.get('client_message_id')

        if not content:
            return Response({'success': False, 'message': 'Message content cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)

        # Deduplication
        if client_msg_id:
            existing = Message.objects.filter(
                conversation=conv,
                sender=request.user,
                client_message_id=client_msg_id
            ).first()
            if existing:
                return Response({
                    'success': True,
                    'message': MessageSerializer(existing).data,
                    'deduplicated': True,
                })

        with transaction.atomic():
            msg = Message.objects.create(
                conversation=conv,
                sender=request.user,
                content=content,
                client_message_id=client_msg_id,
                status='sent'
            )
            conv.updated_at = msg.created_at
            conv.save(update_fields=['updated_at'])

        msg_data = MessageSerializer(msg).data

        # Broadcast via WebSocket
        channel_layer = get_channel_layer()
        if channel_layer:
            async_to_sync(channel_layer.group_send)(
                f"conv_{conv.id}",
                {
                    'type': 'broadcast_new_message',
                    'message': msg_data,
                }
            )
            async_to_sync(channel_layer.group_send)(
                f"user_{other_user.id}",
                {
                    'type': 'broadcast_conversation_update',
                    'conversation_id': conv.id,
                    'message': msg_data,
                }
            )

        return Response({
            'success': True,
            'message': msg_data,
        }, status=status.HTTP_201_CREATED)


ALLOWED_AUDIO_MIMES = {
    'audio/webm': 'webm',
    'audio/webm;codecs=opus': 'webm',
    'audio/ogg': 'ogg',
    'audio/ogg;codecs=opus': 'ogg',
    'audio/mp4': 'mp4',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/wave': 'wav',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
}


def detect_audio_extension(file_obj, content_type):
    clean_ct = (content_type or '').split(';')[0].strip().lower()
    ext = ALLOWED_AUDIO_MIMES.get(clean_ct)
    if not ext:
        ext = ALLOWED_AUDIO_MIMES.get((content_type or '').strip().lower())

    header = file_obj.read(32)
    file_obj.seek(0)

    # Magic byte inspection
    if header.startswith(b'\x1aE\xdf\xa3'):
        return 'webm', 'audio/webm'
    elif header.startswith(b'OggS'):
        return 'ogg', 'audio/ogg'
    elif header.startswith(b'RIFF') and b'WAVE' in header[8:16]:
        return 'wav', 'audio/wav'
    elif b'ftyp' in header[4:12]:
        return 'mp4', 'audio/mp4'
    elif header.startswith(b'ID3') or (len(header) >= 2 and header[0] == 0xFF and (header[1] & 0xE0) == 0xE0):
        return 'mp3', 'audio/mpeg'

    if ext:
        return ext, clean_ct or 'audio/webm'

    return None, None


class VoiceMessageUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, conversation_id):
        try:
            conv = Conversation.objects.select_related('participant_1', 'participant_2').get(id=conversation_id)
        except Conversation.DoesNotExist:
            return Response({'success': False, 'message': 'Conversation not found.'}, status=status.HTTP_404_NOT_FOUND)

        if conv.participant_1_id != request.user.id and conv.participant_2_id != request.user.id:
            return Response({'success': False, 'message': 'Unauthorized.'}, status=status.HTTP_403_FORBIDDEN)

        other_user = conv.get_other_participant(request.user)

        if getattr(request.user, 'is_banned', False) or getattr(other_user, 'is_banned', False):
            return Response({'success': False, 'message': 'Account restricted.'}, status=status.HTTP_403_FORBIDDEN)

        audio_file = request.FILES.get('audio') or request.FILES.get('voice_file')
        if not audio_file:
            return Response({'success': False, 'message': 'Audio file is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # 10 MB maximum file size limit
        if audio_file.size > 10 * 1024 * 1024:
            return Response({'success': False, 'message': 'Audio file exceeds 10MB limit.'}, status=status.HTTP_400_BAD_REQUEST)

        # Duration limit: maximum 120 seconds (2 minutes)
        raw_duration = request.data.get('duration') or request.data.get('duration_seconds') or 0
        try:
            duration_val = float(raw_duration)
        except (ValueError, TypeError):
            duration_val = 0.0

        if duration_val > 125:
            return Response({'success': False, 'message': 'Voice message exceeds 2 minutes limit.'}, status=status.HTTP_400_BAD_REQUEST)

        duration_sec = max(1, min(int(round(duration_val)), 120)) if duration_val > 0 else 1

        # Format detection (WebM, MP4, OGG, WAV, AAC, MP3)
        ext, mime = detect_audio_extension(audio_file, audio_file.content_type)
        if not ext:
            return Response({'success': False, 'message': 'Unsupported or invalid audio format.'}, status=status.HTTP_400_BAD_REQUEST)

        client_msg_id = request.data.get('client_message_id')
        if client_msg_id:
            existing = Message.objects.filter(
                conversation=conv,
                sender=request.user,
                client_message_id=client_msg_id
            ).first()
            if existing:
                return Response({
                    'success': True,
                    'message': MessageSerializer(existing, context={'request': request}).data,
                    'deduplicated': True,
                })

        safe_filename = f"voice_{conv.id}_{secrets.token_hex(16)}.{ext}"

        c_cloud = getattr(settings, 'CLOUDINARY_CLOUD_NAME', None)
        c_key = getattr(settings, 'CLOUDINARY_API_KEY', None)
        c_secret = getattr(settings, 'CLOUDINARY_API_SECRET', None)

        storage_id = None
        upload_success = False

        try:
            # If Cloudinary is configured, upload with resource_type='video' (Cloudinary's audio/video format)
            if c_cloud and c_key and c_secret:
                try:
                    import cloudinary.uploader
                    audio_file.seek(0)
                    up_res = cloudinary.uploader.upload(
                        audio_file,
                        resource_type='video',
                        type='authenticated',
                        folder=f"lynqo_voice/{conv.id}",
                        public_id=f"voice_{conv.id}_{secrets.token_hex(16)}",
                        overwrite=False,
                    )
                    storage_id = up_res.get('public_id')
                    upload_success = True
                except Exception as cl_err:
                    logger.error("Cloudinary voice upload error: %s; falling back to local file storage", cl_err, exc_info=True)
                    storage_id = None
                    upload_success = False

            with transaction.atomic():
                msg = Message(
                    conversation=conv,
                    sender=request.user,
                    client_message_id=client_msg_id,
                    message_type='voice',
                    duration_seconds=duration_sec,
                    file_size=audio_file.size,
                    audio_format=ext,
                    status='sent'
                )
                if upload_success and storage_id:
                    msg.audio_storage_id = storage_id
                    msg.audio_file.name = storage_id
                else:
                    audio_file.seek(0)
                    msg.audio_file.save(safe_filename, audio_file, save=False)
                    msg.audio_storage_id = msg.audio_file.name

                msg.save()
                conv.updated_at = msg.created_at
                conv.save(update_fields=['updated_at'])

            msg_data = MessageSerializer(msg, context={'request': request}).data

            # Broadcast via WebSocket safely
            try:
                channel_layer = get_channel_layer()
                if channel_layer:
                    async_to_sync(channel_layer.group_send)(
                        f"conv_{conv.id}",
                        {
                            'type': 'broadcast_new_message',
                            'message': msg_data,
                        }
                    )
                    async_to_sync(channel_layer.group_send)(
                        f"user_{other_user.id}",
                        {
                            'type': 'broadcast_conversation_update',
                            'conversation_id': conv.id,
                            'message': msg_data,
                        }
                    )
            except Exception as ws_err:
                logger.warning("WebSocket broadcast skipped or failed: %s", ws_err)

            return Response({
                'success': True,
                'message': msg_data,
            }, status=status.HTTP_201_CREATED)

        except Exception as err:
            logger.error("Failed to process voice message upload: %s", err, exc_info=True)
            return Response(
                {
                    'success': False,
                    'message': 'Failed to process voice recording. Please retry.',
                    'detail': str(err),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class VoiceMessageAudioView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, conversation_id, message_id):
        try:
            conv = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            return Response({'success': False, 'message': 'Conversation not found.'}, status=status.HTTP_404_NOT_FOUND)

        if conv.participant_1_id != request.user.id and conv.participant_2_id != request.user.id:
            return Response({'success': False, 'message': 'Unauthorized.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            msg = Message.objects.get(id=message_id, conversation=conv, message_type='voice')
        except Message.DoesNotExist:
            return Response({'success': False, 'message': 'Voice message not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not msg.audio_file and not msg.audio_storage_id:
            return Response({'success': False, 'message': 'Audio file not found.'}, status=status.HTTP_404_NOT_FOUND)

        c_cloud = getattr(settings, 'CLOUDINARY_CLOUD_NAME', None)
        c_key = getattr(settings, 'CLOUDINARY_API_KEY', None)
        c_secret = getattr(settings, 'CLOUDINARY_API_SECRET', None)

        ext = msg.audio_format or 'webm'
        content_type = f"audio/{ext}"

        storage_id = msg.audio_storage_id or (msg.audio_file.name if msg.audio_file else None)
        is_cloudinary = c_cloud and c_key and c_secret and storage_id and not storage_id.startswith('voice_messages/')

        if is_cloudinary:
            try:
                import cloudinary.utils
                signed_url, _ = cloudinary.utils.cloudinary_url(
                    storage_id,
                    resource_type='video',
                    sign_url=True,
                    type='authenticated',
                    expires_at=int(time.time()) + 3600
                )
                if request.query_params.get('json') == '1':
                    return Response({'success': True, 'audio_url': signed_url})
                return HttpResponseRedirect(signed_url)
            except Exception as cl_err:
                logger.error("Cloudinary signed URL error: %s", cl_err)

        try:
            file_handle = msg.audio_file.open('rb')
            response = FileResponse(file_handle, content_type=content_type)
            filename = os.path.basename(msg.audio_file.name or f"voice_{msg.id}.{ext}")
            response['Content-Disposition'] = f'inline; filename="{filename}"'
            return response
        except Exception as file_err:
            logger.error("Local audio file open error: %s", file_err)
            return Response({'success': False, 'message': 'Audio file not found or inaccessible.'}, status=status.HTTP_404_NOT_FOUND)

