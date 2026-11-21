import secrets
import time
import os
import io
import mimetypes
import logging
from PIL import Image
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.contrib.auth.hashers import make_password, check_password
from django.db import transaction, models
from django.core.cache import cache
from django.http import HttpResponse, FileResponse, HttpResponseRedirect
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

DUMMY_PASSWORD_HASH = make_password("dummy-constant-time-salt-value-for-lynqo")


def check_login_rate_limit(ip, username):
    norm_user = (username or '').strip().lower()
    ip_key = f"login_fail_ip:{ip}"
    user_key = f"login_fail_user:{norm_user}" if norm_user else None
    ip_fails = cache.get(ip_key, 0)
    user_fails = cache.get(user_key, 0) if user_key else 0
    if ip_fails >= 5 or user_fails >= 5:
        return False
    return True


def record_login_failure(ip, username):
    norm_user = (username or '').strip().lower()
    ip_key = f"login_fail_ip:{ip}"
    try:
        cache.incr(ip_key)
    except ValueError:
        cache.set(ip_key, 1, 900)

    if norm_user:
        user_key = f"login_fail_user:{norm_user}"
        try:
            cache.incr(user_key)
        except ValueError:
            cache.set(user_key, 1, 900)


def clear_login_failures(ip, username):
    norm_user = (username or '').strip().lower()
    cache.delete(f"login_fail_ip:{ip}")
    if norm_user:
        cache.delete(f"login_fail_user:{norm_user}")


def check_recovery_rate_limit(ip, username):
    ip_key = f"rec_fail_ip:{ip}"
    norm_user = (username or '').strip().lower()
    user_key = f"rec_fail_user:{norm_user}" if norm_user else None
    if cache.get(ip_key, 0) >= 5 or (user_key and cache.get(user_key, 0) >= 5):
        return False
    return True


def record_recovery_failure(ip, username):
    norm_user = (username or '').strip().lower()
    ip_key = f"rec_fail_ip:{ip}"
    try:
        cache.incr(ip_key)
    except ValueError:
        cache.set(ip_key, 1, 900)
    if norm_user:
        user_key = f"rec_fail_user:{norm_user}"
        try:
            cache.incr(user_key)
        except ValueError:
            cache.set(user_key, 1, 900)


def clear_recovery_failures(ip, username):
    norm_user = (username or '').strip().lower()
    cache.delete(f"rec_fail_ip:{ip}")
    if norm_user:
        cache.delete(f"rec_fail_user:{norm_user}")


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
    suffix = profile_id.split('-')[1] if '-' in profile_id else profile_id[:5].upper()
    alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    code_part = "".join(secrets.choice(alphabet) for _ in range(8))
    return f"REC-{suffix}-{code_part}"


# ============================================================================
# PHASE 2 — AUTHENTICATION & MULTI-DEVICE SESSION SYSTEM VIEWS
# ============================================================================

class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        username = (request.data.get('username') or '').strip()
        password = request.data.get('password') or ''
        ip = request.META.get('REMOTE_ADDR') or 'unknown'

        if not username or not password:
            return Response(
                {'success': False, 'message': 'Username and password are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not check_login_rate_limit(ip, username):
            return Response(
                {'success': False, 'message': 'Too many failed login attempts. Please try again in 15 minutes or recover your account.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        user = User.objects.filter(
            models.Q(username__iexact=username) | models.Q(profile__profile_id__iexact=username)
        ).select_related('profile').first()

        if not user or not user.has_usable_password():
            check_password(password, DUMMY_PASSWORD_HASH)
            record_login_failure(ip, username)
            return Response(
                {'success': False, 'message': 'Invalid username or password.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if not check_password(password, user.password):
            record_login_failure(ip, username)
            return Response(
                {'success': False, 'message': 'Invalid username or password.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if user.is_banned:
            return Response(
                {'success': False, 'message': 'Account is suspended.'},
                status=status.HTTP_403_FORBIDDEN
            )

        clear_login_failures(ip, username)

        profile = getattr(user, 'profile', None)
        if not profile:
            profile_id = Profile.generate_unique_profile_id()
            profile = Profile.objects.create(
                user=user,
                profile_id=profile_id,
                display_name=user.full_name or user.username
            )

        # Multi-device login: creates an independent session for this device
        session = ProfileSession.create_session(user, request)

        response_data = {
            'success': True,
            'message': 'Login successful.',
            'token': session.token,
            'profile': ProfileDetailSerializer(profile).data,
        }
        response = Response(response_data, status=status.HTTP_200_OK)
        set_session_cookie(response, session.token)
        return response


class ProfileCreateView(APIView):
    permission_classes = [permissions.AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        serializer = ProfileCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        display_name = serializer.validated_data['display_name']
        custom_username = (serializer.validated_data.get('username') or '').strip()
        password = serializer.validated_data.get('password')
        profile_picture = serializer.validated_data.get('profile_picture')

        if custom_username:
            if len(custom_username) < 3:
                return Response(
                    {'success': False, 'message': 'Username must be at least 3 characters long.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if User.objects.filter(
                models.Q(username__iexact=custom_username) | models.Q(profile__profile_id__iexact=custom_username)
            ).exists():
                return Response(
                    {'success': False, 'message': 'Username is already taken.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        if password and len(password) < 4:
            return Response(
                {'success': False, 'message': 'Password must be at least 4 characters long.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            profile_id = Profile.generate_unique_profile_id()
            username = custom_username if custom_username else profile_id

            user = User.objects.create(
                username=username,
                full_name=display_name
            )
            if password:
                user.set_password(password)
            else:
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
        ip = request.META.get('REMOTE_ADDR') or 'unknown'
        username = (request.data.get('username') or '').strip()
        raw_code = (request.data.get('recovery_code') or '').strip().upper()
        new_password = request.data.get('new_password') or request.data.get('password')

        if not raw_code:
            return Response(
                {'success': False, 'message': 'Recovery code is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not check_recovery_rate_limit(ip, username):
            return Response(
                {'success': False, 'message': 'Too many recovery attempts. Please try again in 15 minutes.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        profile = None
        user = None

        if username:
            user = User.objects.filter(
                models.Q(username__iexact=username) | models.Q(profile__profile_id__iexact=username)
            ).select_related('profile').first()
            if user:
                profile = getattr(user, 'profile', None)

        if not profile and '-' in raw_code:
            parts = raw_code.split('-')
            if len(parts) >= 2 and parts[0] == 'REC':
                suffix = parts[1]
                expected_profile_id = f"LYNQ-{suffix}"
                profile = Profile.objects.select_related('user').filter(profile_id=expected_profile_id).first()
                if profile:
                    user = profile.user

        if not profile or not user:
            check_password('dummy', DUMMY_PASSWORD_HASH)
            record_recovery_failure(ip, username)
            return Response(
                {'success': False, 'message': 'Invalid recovery credentials.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not profile.recovery_code_hash or not check_password(raw_code, profile.recovery_code_hash):
            record_recovery_failure(ip, username)
            return Response(
                {'success': False, 'message': 'Invalid recovery credentials.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if new_password and len(new_password) < 4:
            return Response(
                {'success': False, 'message': 'Password must be at least 4 characters long.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        clear_recovery_failures(ip, username)

        with transaction.atomic():
            if new_password:
                user.set_password(new_password)
                user.save()

            # Revoke all old sessions after successful recovery!
            old_sessions = ProfileSession.objects.filter(user=user, is_active=True)
            for s in old_sessions:
                s.is_active = False
                s.save(update_fields=['is_active'])
                invalidate_session_cache(s.token)

            # Rotate recovery code (single use!)
            new_recovery_code = generate_recovery_code(profile.profile_id)
            profile.recovery_code_hash = make_password(new_recovery_code)
            profile.recovery_code_created_at = timezone.now()
            profile.save(update_fields=['recovery_code_hash', 'recovery_code_created_at'])

            session = ProfileSession.create_session(user, request)

        response_data = {
            'success': True,
            'message': 'Account recovered successfully. A new recovery code has been generated.',
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


class ProfileLogoutAllView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        sessions = ProfileSession.objects.filter(user=request.user, is_active=True)
        for s in sessions:
            s.is_active = False
            s.save(update_fields=['is_active'])
            invalidate_session_cache(s.token)

        response = Response({'success': True, 'message': 'Logged out from all devices successfully.'})
        clear_session_cookie(response)
        return response


class ActiveSessionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        current_token = getattr(getattr(request, 'profile_session', None), 'token', None)
        sessions = ProfileSession.objects.filter(user=request.user, is_active=True).order_by('-last_seen')[:15]
        data = []
        for s in sessions:
            data.append({
                'id': s.id,
                'user_agent': s.user_agent,
                'ip_address': s.ip_address,
                'created_at': s.created_at,
                'last_seen': s.last_seen,
                'is_current': s.token == current_token,
            })
        return Response({'success': True, 'sessions': data})


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
                Message.objects.filter(conversation=models.OuterRef('pk')).order_by('-created_at').values('id')[:1]
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

        # Optimize: fetch fully preloaded conversation to eliminate N+1 serializer queries
        conv = Conversation.objects.select_related(
            'participant_1__profile', 'participant_2__profile'
        ).get(id=conv.id)
        if created:
            conv.annotated_unread_count = 0
            conv.prefetched_last_message = None
        else:
            conv.annotated_unread_count = Message.objects.filter(
                conversation=conv, is_read=False
            ).exclude(sender=request.user).count()
            conv.prefetched_last_message = Message.objects.filter(
                conversation=conv
            ).select_related('sender__profile').order_by('-created_at').first()

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
        around_id = request.query_params.get('around_id')

        qs = Message.objects.filter(conversation=conv).exclude(deleted_for=request.user).select_related(
            'sender__profile', 'conversation', 'reply_to', 'reply_to__sender__profile'
        ).prefetch_related('reply_to__deleted_for')

        if around_id:
            try:
                target_id = int(around_id)
                half = limit // 2
                before_qs = list(qs.filter(id__lte=target_id).order_by('-id')[:half + 1])
                after_qs = list(qs.filter(id__gt=target_id).order_by('id')[:half])
                combined = sorted(before_qs + after_qs, key=lambda m: (m.created_at, m.id))
                return Response({
                    'success': True,
                    'messages': MessageSerializer(combined, many=True, context={'request': request}).data,
                    'has_more': False,
                })
            except (ValueError, TypeError):
                pass

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
            'messages': MessageSerializer(messages, many=True, context={'request': request}).data,
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
        reply_to_id = request.data.get('reply_to_id') or request.data.get('reply_to')

        if not content:
            return Response({'success': False, 'message': 'Message content cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)

        reply_to_msg = None
        if reply_to_id:
            try:
                reply_to_msg = Message.objects.select_related('sender', 'sender__profile').get(
                    id=reply_to_id,
                    conversation=conv
                )
            except (Message.DoesNotExist, ValueError):
                return Response(
                    {'success': False, 'message': 'Replied message not found in this conversation.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Deduplication
        if client_msg_id:
            existing = Message.objects.select_related(
                'sender', 'sender__profile', 'reply_to', 'reply_to__sender', 'reply_to__sender__profile'
            ).filter(
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

        with transaction.atomic():
            msg = Message.objects.create(
                conversation=conv,
                sender=request.user,
                content=content,
                client_message_id=client_msg_id,
                reply_to=reply_to_msg,
                status='sent'
            )
            conv.updated_at = msg.created_at
            conv.save(update_fields=['updated_at'])

        msg_data = MessageSerializer(msg, context={'request': request}).data

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
            async_to_sync(channel_layer.group_send)(
                f"user_{request.user.id}",
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


class MessageEditView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def put(self, request, conversation_id, message_id):
        return self._edit(request, conversation_id, message_id)

    def patch(self, request, conversation_id, message_id):
        return self._edit(request, conversation_id, message_id)

    def _edit(self, request, conversation_id, message_id):
        try:
            conv = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            return Response({'success': False, 'message': 'Conversation not found.'}, status=status.HTTP_404_NOT_FOUND)

        if conv.participant_1_id != request.user.id and conv.participant_2_id != request.user.id:
            return Response({'success': False, 'message': 'Unauthorized.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            msg = Message.objects.select_related('sender__profile', 'conversation').get(id=message_id, conversation=conv)
        except Message.DoesNotExist:
            return Response({'success': False, 'message': 'Message not found.'}, status=status.HTTP_404_NOT_FOUND)

        if msg.sender_id != request.user.id:
            return Response({'success': False, 'message': 'You can only edit your own messages.'}, status=status.HTTP_403_FORBIDDEN)

        if msg.message_type != 'text':
            return Response({'success': False, 'message': 'Only text messages can be edited.'}, status=status.HTTP_400_BAD_REQUEST)

        if msg.is_deleted:
            return Response({'success': False, 'message': 'Cannot edit a deleted message.'}, status=status.HTTP_400_BAD_REQUEST)

        new_content = (request.data.get('content') or '').strip()
        if not new_content:
            return Response({'success': False, 'message': 'Message content cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)

        msg.content = new_content
        msg.is_edited = True
        msg.save(update_fields=['content', 'is_edited', 'updated_at'])

        msg_data = MessageSerializer(msg, context={'request': request}).data

        # Broadcast update over WebSocket
        other_user = conv.get_other_participant(request.user)
        channel_layer = get_channel_layer()
        if channel_layer:
            event = {
                'type': 'broadcast_message_edited',
                'message': msg_data,
            }
            async_to_sync(channel_layer.group_send)(f"conv_{conv.id}", event)
            if other_user:
                async_to_sync(channel_layer.group_send)(f"user_{other_user.id}", event)

        return Response({
            'success': True,
            'message': msg_data,
        }, status=status.HTTP_200_OK)


class MessageDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, conversation_id, message_id):
        try:
            conv = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            return Response({'success': False, 'message': 'Conversation not found.'}, status=status.HTTP_404_NOT_FOUND)

        if conv.participant_1_id != request.user.id and conv.participant_2_id != request.user.id:
            return Response({'success': False, 'message': 'Unauthorized.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            msg = Message.objects.get(id=message_id, conversation=conv)
        except Message.DoesNotExist:
            return Response({'success': False, 'message': 'Message not found.'}, status=status.HTTP_404_NOT_FOUND)

        delete_type = (request.query_params.get('type') or request.data.get('type') or 'everyone').lower()

        if delete_type == 'me':
            msg.deleted_for.add(request.user)
            return Response({
                'success': True,
                'message_id': msg.id,
                'delete_type': 'me',
            }, status=status.HTTP_200_OK)

        elif delete_type == 'everyone':
            if msg.sender_id != request.user.id:
                return Response({'success': False, 'message': 'Only the sender can delete a message for everyone.'}, status=status.HTTP_403_FORBIDDEN)

            msg.is_deleted = True
            msg.content = ''
            if msg.message_type == 'voice':
                if msg.audio_storage_id and getattr(settings, 'CLOUDINARY_CLOUD_NAME', None):
                    try:
                        import cloudinary.uploader
                        cloudinary.uploader.destroy(msg.audio_storage_id, resource_type='video', type='authenticated')
                    except Exception as cl_err:
                        logger.warning("Failed to destroy Cloudinary audio asset: %s", cl_err)
                msg.audio_storage_id = None
                if msg.audio_file:
                    try:
                        msg.audio_file.delete(save=False)
                    except Exception:
                        pass
                cache.delete(f"voice_signed_url:{msg.id}")

            if msg.message_type == 'image':
                c_cloud = getattr(settings, 'CLOUDINARY_CLOUD_NAME', None)
                if c_cloud:
                    try:
                        import cloudinary.uploader
                        if msg.image_storage_id and not msg.image_storage_id.startswith('chat_images/'):
                            main_type = 'authenticated' if ('lynqo_chat_auth' in msg.image_storage_id or '_auth' in msg.image_storage_id or 'auth_' in msg.image_storage_id) else 'upload'
                            cloudinary.uploader.destroy(msg.image_storage_id, resource_type='image', type=main_type)
                        if msg.image_thumbnail_id and not msg.image_thumbnail_id.startswith('chat_thumbnails/'):
                            thumb_type = 'authenticated' if ('lynqo_chat_auth' in msg.image_thumbnail_id or '_auth' in msg.image_thumbnail_id or 'auth_' in msg.image_thumbnail_id) else 'upload'
                            cloudinary.uploader.destroy(msg.image_thumbnail_id, resource_type='image', type=thumb_type)
                    except Exception as cl_err:
                        logger.warning("Failed to destroy Cloudinary image assets: %s", cl_err)

                msg.image_storage_id = None
                msg.image_thumbnail_id = None
                if msg.image_file:
                    try:
                        msg.image_file.delete(save=False)
                    except Exception:
                        pass
                if msg.image_thumbnail:
                    try:
                        msg.image_thumbnail.delete(save=False)
                    except Exception:
                        pass
                cache.delete(f"image_signed_url:{msg.id}:0")
                cache.delete(f"image_signed_url:{msg.id}:1")

            msg.save(update_fields=[
                'is_deleted', 'content', 'audio_storage_id', 'audio_file',
                'image_storage_id', 'image_thumbnail_id', 'image_file', 'image_thumbnail',
                'updated_at'
            ])

            other_user = conv.get_other_participant(request.user)
            channel_layer = get_channel_layer()
            if channel_layer:
                event = {
                    'type': 'broadcast_message_deleted',
                    'message_id': msg.id,
                    'conversation_id': conv.id,
                    'delete_type': 'everyone',
                }
                async_to_sync(channel_layer.group_send)(f"conv_{conv.id}", event)
                if other_user:
                    async_to_sync(channel_layer.group_send)(f"user_{other_user.id}", event)

            return Response({
                'success': True,
                'message_id': msg.id,
                'delete_type': 'everyone',
            }, status=status.HTTP_200_OK)

        else:
            return Response({'success': False, 'message': 'Invalid delete type. Must be "me" or "everyone".'}, status=status.HTTP_400_BAD_REQUEST)



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

        reply_to_id = request.data.get('reply_to_id') or request.data.get('reply_to')
        reply_to_msg = None
        if reply_to_id:
            try:
                reply_to_msg = Message.objects.select_related('sender', 'sender__profile').get(
                    id=reply_to_id,
                    conversation=conv
                )
            except (Message.DoesNotExist, ValueError):
                return Response(
                    {'success': False, 'message': 'Replied message not found in this conversation.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

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
                    reply_to=reply_to_msg,
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
                    async_to_sync(channel_layer.group_send)(
                        f"user_{request.user.id}",
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

        ext = (msg.audio_format or '').lower()
        if not ext and msg.audio_file:
            ext = os.path.splitext(msg.audio_file.name)[1].lstrip('.').lower()
        ext = ext or 'webm'

        MIME_MAP = {
            'webm': 'audio/webm',
            'ogg': 'audio/ogg',
            'wav': 'audio/wav',
            'mp4': 'audio/mp4',
            'm4a': 'audio/mp4',
            'aac': 'audio/aac',
            'mp3': 'audio/mpeg',
        }
        content_type = MIME_MAP.get(ext, f"audio/{ext}")

        storage_id = msg.audio_storage_id or (msg.audio_file.name if msg.audio_file else None)
        is_cloudinary = c_cloud and c_key and c_secret and storage_id and not storage_id.startswith('voice_messages/')

        if is_cloudinary:
            cache_key = f"voice_signed_url:{msg.id}"
            cached_url = cache.get(cache_key)
            if cached_url:
                if request.query_params.get('json') == '1':
                    return Response({'success': True, 'audio_url': cached_url})
                if request.query_params.get('proxy') in ('1', 'true', 'yes'):
                    return self._proxy_audio(cached_url, content_type)
                resp = HttpResponseRedirect(cached_url)
                resp['Cache-Control'] = 'private, no-cache, no-store, must-revalidate'
                resp['Pragma'] = 'no-cache'
                return resp

            try:
                import cloudinary.utils
                auth_token_key = getattr(settings, 'CLOUDINARY_AUTH_TOKEN_KEY', None)
                token_opts = {'duration': 3600, 'key': auth_token_key} if auth_token_key else None
                url_kwargs = {
                    'resource_type': 'video',
                    'sign_url': True,
                    'type': 'authenticated',
                    'expires_at': int(time.time()) + 3600,
                }
                if token_opts:
                    url_kwargs['auth_token'] = token_opts

                signed_url, _ = cloudinary.utils.cloudinary_url(storage_id, **url_kwargs)
                cache.set(cache_key, signed_url, 1800)  # Cache for 30 minutes
                if request.query_params.get('json') == '1':
                    return Response({'success': True, 'audio_url': signed_url})
                if request.query_params.get('proxy') in ('1', 'true', 'yes'):
                    return self._proxy_audio(signed_url, content_type)
                resp = HttpResponseRedirect(signed_url)
                resp['Cache-Control'] = 'private, no-cache, no-store, must-revalidate'
                resp['Pragma'] = 'no-cache'
                return resp
            except Exception as cl_err:
                logger.error("Cloudinary signed URL error: %s", cl_err)

        if not msg.audio_file:
            return Response({'success': False, 'message': 'Audio file not found or inaccessible.'}, status=status.HTTP_404_NOT_FOUND)

        if request.query_params.get('json') == '1':
            return Response({
                'success': True,
                'audio_url': f"/api/auth/conversations/{conv.id}/messages/{msg.id}/audio/",
                'is_direct': True,
            })

        try:
            file_path = msg.audio_file.path
        except (AttributeError, NotImplementedError):
            file_path = None

        filename = os.path.basename(msg.audio_file.name or f"voice_{msg.id}.{ext}")

        # Handle Range requests for WebKit/Safari and smooth audio playback/seeking
        range_header = request.headers.get('Range') or request.META.get('HTTP_RANGE', '')
        if file_path and os.path.exists(file_path):
            file_size = os.path.getsize(file_path)
            if range_header and range_header.startswith('bytes='):
                try:
                    range_spec = range_header.replace('bytes=', '').strip()
                    parts = range_spec.split('-')
                    start = int(parts[0]) if parts[0] else 0
                    end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
                    end = min(end, file_size - 1)
                    if start <= end and start < file_size:
                        length = end - start + 1
                        with open(file_path, 'rb') as f:
                            f.seek(start)
                            data = f.read(length)
                        resp = HttpResponse(data, status=206, content_type=content_type)
                        resp['Content-Range'] = f"bytes {start}-{end}/{file_size}"
                        resp['Accept-Ranges'] = 'bytes'
                        resp['Content-Length'] = str(length)
                        resp['Content-Disposition'] = f'inline; filename="{filename}"'
                        return resp
                except Exception as range_err:
                    logger.warning("Error parsing Range header: %s", range_err)

            try:
                file_handle = open(file_path, 'rb')
                response = FileResponse(file_handle, content_type=content_type)
                response['Accept-Ranges'] = 'bytes'
                response['Content-Length'] = str(file_size)
                response['Content-Disposition'] = f'inline; filename="{filename}"'
                return response
            except Exception as file_err:
                logger.error("Local audio file open error: %s", file_err)
                return Response({'success': False, 'message': 'Audio file not found or inaccessible.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            file_handle = msg.audio_file.open('rb')
            response = FileResponse(file_handle, content_type=content_type)
            response['Accept-Ranges'] = 'bytes'
            response['Content-Disposition'] = f'inline; filename="{filename}"'
            return response
        except Exception as file_err:
            logger.error("Local audio file open error: %s", file_err)
            return Response({'success': False, 'message': 'Audio file not found or inaccessible.'}, status=status.HTTP_404_NOT_FOUND)

    def _proxy_audio(self, target_url, content_type):
        import urllib.request
        try:
            req = urllib.request.Request(target_url, headers={'User-Agent': 'LYNQO-Media-Proxy/1.0'})
            with urllib.request.urlopen(req, timeout=15) as res:
                content = res.read()
                c_type = res.headers.get_content_type() or content_type
                proxy_resp = HttpResponse(content, content_type=c_type)
                proxy_resp['Cache-Control'] = 'private, no-cache, no-store, must-revalidate'
                proxy_resp['Pragma'] = 'no-cache'
                proxy_resp['Accept-Ranges'] = 'bytes'
                return proxy_resp
        except Exception as e:
            logger.error("Audio proxy failed for %s: %s", target_url, e)
            return Response({'success': False, 'message': 'Failed to proxy audio.'}, status=status.HTTP_502_BAD_GATEWAY)


class ImageMessageUploadView(APIView):
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

        image_file = request.FILES.get('image') or request.FILES.get('file')
        if not image_file:
            return Response({'success': False, 'message': 'Image file is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # 10 MB maximum file size limit
        if image_file.size > 10 * 1024 * 1024:
            return Response({'success': False, 'message': 'Image file exceeds 10MB limit.'}, status=status.HTTP_400_BAD_REQUEST)

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

        try:
            image_file.seek(0)
            img = Image.open(image_file)
            img.verify()
            image_file.seek(0)
            img = Image.open(image_file)
        except Exception:
            return Response({'success': False, 'message': 'Invalid or unreadable image file.'}, status=status.HTTP_400_BAD_REQUEST)

        orig_width, orig_height = img.size
        orig_format = (img.format or 'JPEG').upper()
        if orig_format not in ('JPEG', 'PNG', 'WEBP'):
            orig_format = 'JPEG'

        try:
            from PIL import ImageOps
            img = ImageOps.exif_transpose(img)
            orig_width, orig_height = img.size
        except Exception:
            pass

        # Compress/downscale original if larger than 1920x1920
        max_dim = 1920
        main_img = img.copy()
        if max(orig_width, orig_height) > max_dim:
            main_img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
            main_width, main_height = main_img.size
        else:
            main_width, main_height = orig_width, orig_height

        main_buf = io.BytesIO()
        save_format = 'JPEG' if orig_format == 'JPEG' else ('PNG' if orig_format == 'PNG' else 'WEBP')
        if save_format == 'JPEG' and main_img.mode in ('RGBA', 'P'):
            main_img = main_img.convert('RGB')
        main_img.save(main_buf, format=save_format, quality=85, optimize=True)
        main_bytes = main_buf.getvalue()

        # Generate thumbnail (max 360x360)
        thumb_img = img.copy()
        thumb_img.thumbnail((360, 360), Image.Resampling.LANCZOS)
        thumb_buf = io.BytesIO()
        if thumb_img.mode in ('RGBA', 'P'):
            thumb_img = thumb_img.convert('RGB')
        thumb_img.save(thumb_buf, format='JPEG', quality=80, optimize=True)
        thumb_bytes = thumb_buf.getvalue()

        ext = 'jpg' if save_format == 'JPEG' else ('png' if save_format == 'PNG' else 'webp')
        safe_base = f"img_{conv.id}_{secrets.token_hex(16)}"
        safe_filename = f"{safe_base}.{ext}"
        thumb_filename = f"{safe_base}_thumb.jpg"

        c_cloud = getattr(settings, 'CLOUDINARY_CLOUD_NAME', None)
        c_key = getattr(settings, 'CLOUDINARY_API_KEY', None)
        c_secret = getattr(settings, 'CLOUDINARY_API_SECRET', None)

        image_storage_id = None
        thumb_storage_id = None
        upload_success = False

        if c_cloud and c_key and c_secret:
            try:
                import cloudinary.uploader
                auth_folder = f"lynqo_chat_auth/{conv.id}"
                auth_base = f"auth_{safe_base}"
                up_main = cloudinary.uploader.upload(
                    main_bytes,
                    resource_type='image',
                    type='authenticated',
                    folder=auth_folder,
                    public_id=auth_base,
                    overwrite=False,
                )
                image_storage_id = up_main.get('public_id')

                up_thumb = cloudinary.uploader.upload(
                    thumb_bytes,
                    resource_type='image',
                    type='authenticated',
                    folder=f"{auth_folder}/thumbs",
                    public_id=f"{auth_base}_thumb",
                    overwrite=False,
                )
                thumb_storage_id = up_thumb.get('public_id')
                upload_success = True
            except Exception as cl_err:
                logger.error("Cloudinary chat image upload failed, falling back to local file storage: %s", cl_err)
                image_storage_id = None
                thumb_storage_id = None
                upload_success = False

        reply_to_id = request.data.get('reply_to_id') or request.data.get('reply_to')
        reply_to_msg = None
        if reply_to_id:
            try:
                reply_to_msg = Message.objects.select_related('sender', 'sender__profile').get(
                    id=reply_to_id,
                    conversation=conv
                )
            except (Message.DoesNotExist, ValueError):
                return Response(
                    {'success': False, 'message': 'Replied message not found in this conversation.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        from django.core.files.base import ContentFile

        with transaction.atomic():
            msg = Message(
                conversation=conv,
                sender=request.user,
                client_message_id=client_msg_id,
                reply_to=reply_to_msg,
                message_type='image',
                image_width=main_width,
                image_height=main_height,
                file_size=len(main_bytes),
                status='sent'
            )
            if upload_success and image_storage_id:
                msg.image_storage_id = image_storage_id
                msg.image_thumbnail_id = thumb_storage_id
                msg.image_file.name = image_storage_id
                if thumb_storage_id:
                    msg.image_thumbnail.name = thumb_storage_id
            else:
                msg.image_file.save(safe_filename, ContentFile(main_bytes), save=False)
                msg.image_thumbnail.save(thumb_filename, ContentFile(thumb_bytes), save=False)
                msg.image_storage_id = msg.image_file.name
                msg.image_thumbnail_id = msg.image_thumbnail.name

            msg.save()
            conv.updated_at = msg.created_at
            conv.save(update_fields=['updated_at'])

        msg_data = MessageSerializer(msg, context={'request': request}).data

        # WebSocket Broadcast to conversation and both users
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
                async_to_sync(channel_layer.group_send)(
                    f"user_{request.user.id}",
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


class ImageMessageMediaView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, conversation_id, message_id):
        try:
            conv = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            return Response({'success': False, 'message': 'Conversation not found.'}, status=status.HTTP_404_NOT_FOUND)

        if conv.participant_1_id != request.user.id and conv.participant_2_id != request.user.id:
            return Response({'success': False, 'message': 'Unauthorized.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            msg = Message.objects.get(id=message_id, conversation=conv, message_type='image')
        except Message.DoesNotExist:
            return Response({'success': False, 'message': 'Image not found.'}, status=status.HTTP_404_NOT_FOUND)

        if msg.is_deleted:
            return Response({'success': False, 'message': 'Image not found.'}, status=status.HTTP_404_NOT_FOUND)

        is_thumb = request.query_params.get('thumb') in ('1', 'true', 'yes')

        c_cloud = getattr(settings, 'CLOUDINARY_CLOUD_NAME', None)
        c_key = getattr(settings, 'CLOUDINARY_API_KEY', None)
        c_secret = getattr(settings, 'CLOUDINARY_API_SECRET', None)
        storage_id = msg.image_thumbnail_id if (is_thumb and msg.image_thumbnail_id) else msg.image_storage_id

        is_cloudinary = (
            c_cloud and c_key and c_secret and storage_id
            and not storage_id.startswith('chat_images/')
            and not storage_id.startswith('chat_thumbnails/')
            and not os.path.exists(str(storage_id))
        )

        if is_cloudinary:
            cache_key = f"image_signed_url:{msg.id}:{1 if is_thumb else 0}"
            cached_url = cache.get(cache_key)
            if cached_url:
                if request.query_params.get('json') == '1':
                    return Response({'success': True, 'image_url': cached_url})
                if request.query_params.get('proxy') in ('1', 'true', 'yes'):
                    return self._proxy_image(cached_url)
                resp = HttpResponseRedirect(cached_url)
                resp['Cache-Control'] = 'private, no-cache, no-store, must-revalidate'
                resp['Pragma'] = 'no-cache'
                return resp

            try:
                import cloudinary.utils
                transformation = {'quality': 'auto', 'fetch_format': 'auto'}
                if is_thumb:
                    transformation.update({'width': 360, 'crop': 'limit'})

                # Authenticated type for all modern protected images; graceful upload type for legacy
                if 'lynqo_chat_auth' in storage_id or '_auth' in storage_id or 'auth_' in storage_id:
                    cld_type = 'authenticated'
                elif storage_id.startswith('lynqo_chat/'):
                    cld_type = 'upload'
                else:
                    cld_type = 'authenticated'

                auth_token_key = getattr(settings, 'CLOUDINARY_AUTH_TOKEN_KEY', None)
                token_opts = {'duration': 3600, 'key': auth_token_key} if auth_token_key else None
                url_kwargs = {
                    'resource_type': 'image',
                    'type': cld_type,
                    'sign_url': True,
                    'expires_at': int(time.time()) + 3600,
                    'secure': True,
                    'transformation': transformation,
                }
                if token_opts:
                    url_kwargs['auth_token'] = token_opts

                c_url, _ = cloudinary.utils.cloudinary_url(storage_id, **url_kwargs)
                cache.set(cache_key, c_url, 1800)  # Cache signed URL for 30 minutes
                if request.query_params.get('json') == '1':
                    return Response({'success': True, 'image_url': c_url})
                if request.query_params.get('proxy') in ('1', 'true', 'yes'):
                    return self._proxy_image(c_url)
                resp = HttpResponseRedirect(c_url)
                resp['Cache-Control'] = 'private, no-cache, no-store, must-revalidate'
                resp['Pragma'] = 'no-cache'
                return resp
            except Exception as err:
                logger.warning("Cloudinary URL generation error: %s", err)

        target_field = msg.image_thumbnail if (is_thumb and msg.image_thumbnail) else msg.image_file
        if not target_field:
            return Response({'success': False, 'message': 'Image file missing.'}, status=status.HTTP_404_NOT_FOUND)

        if request.query_params.get('json') == '1':
            media_path = f"/api/auth/conversations/{conv.id}/messages/{msg.id}/image/{'?thumb=1' if is_thumb else ''}"
            return Response({'success': True, 'image_url': media_path, 'is_direct': True})

        try:
            file_handle = target_field.open('rb')
            ext = os.path.splitext(target_field.name)[1].lower()
            mime = 'image/jpeg'
            if ext == '.png':
                mime = 'image/png'
            elif ext == '.webp':
                mime = 'image/webp'
            resp = FileResponse(file_handle, content_type=mime)
            resp['Cache-Control'] = 'private, no-cache, no-store, must-revalidate'
            resp['Pragma'] = 'no-cache'
            resp['X-Content-Type-Options'] = 'nosniff'
            return resp
        except Exception as e:
            logger.error("Failed to read image file from disk: %s", e)
            return Response({'success': False, 'message': 'Failed to read image file.'}, status=status.HTTP_404_NOT_FOUND)

    def _proxy_image(self, target_url):
        import urllib.request
        try:
            req = urllib.request.Request(target_url, headers={'User-Agent': 'LYNQO-Media-Proxy/1.0'})
            with urllib.request.urlopen(req, timeout=15) as res:
                content = res.read()
                content_type = res.headers.get_content_type() or 'image/jpeg'
                proxy_resp = HttpResponse(content, content_type=content_type)
                proxy_resp['Cache-Control'] = 'private, no-cache, no-store, must-revalidate'
                proxy_resp['Pragma'] = 'no-cache'
                proxy_resp['X-Content-Type-Options'] = 'nosniff'
                return proxy_resp
        except Exception as e:
            logger.error("Image proxy failed for %s: %s", target_url, e)
            return Response({'success': False, 'message': 'Failed to proxy image.'}, status=status.HTTP_502_BAD_GATEWAY)

