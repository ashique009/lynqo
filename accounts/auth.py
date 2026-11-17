from rest_framework import authentication, exceptions
from django.utils import timezone
from .models import ProfileSession

SESSION_COOKIE_NAME = 'lynqo_session'

class ProfileSessionAuthentication(authentication.BaseAuthentication):
    """
    Authenticates requests using:
    1. HttpOnly 'lynqo_session' cookie
    2. 'Authorization: Bearer <token>' or 'Authorization: Session <token>'
    """
    def authenticate(self, request):
        token = None

        # 1. Check Authorization header
        auth_header = request.headers.get('Authorization')
        if auth_header:
            parts = auth_header.split()
            if len(parts) == 2 and parts[0].lower() in ('bearer', 'session', 'token'):
                token = parts[1]

        # 2. Check Cookie
        if not token:
            token = request.COOKIES.get(SESSION_COOKIE_NAME)

        if not token:
            return None

        try:
            session = ProfileSession.objects.select_related('user', 'user__profile').get(
                token=token,
                is_active=True
            )
        except ProfileSession.DoesNotExist:
            raise exceptions.AuthenticationFailed('Invalid or expired session.')

        if session.user.is_banned:
            raise exceptions.PermissionDenied('Account is banned.')

        # Update last seen timestamp lazily (throttled to once every 60 seconds to avoid excessive DB writes)
        now = timezone.now()
        if not session.last_seen or (now - session.last_seen).total_seconds() > 60:
            session.last_seen = now
            session.save(update_fields=['last_seen'])

        # Store session object on request for downstream usage
        request.profile_session = session

        return (session.user, session)
