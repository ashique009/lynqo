from rest_framework import authentication, exceptions
from django.utils import timezone
from django.core.cache import cache
from .models import ProfileSession

SESSION_COOKIE_NAME = 'lynqo_session'

def invalidate_session_cache(token):
    """Evicts a session token from the in-memory authentication cache."""
    if token:
        cache.delete(f"auth_session:{token}")

class ProfileSessionAuthentication(authentication.BaseAuthentication):
    """
    Authenticates requests using:
    1. HttpOnly 'lynqo_session' cookie
    2. 'Authorization: Bearer <token>' or 'Authorization: Session <token>'
    Uses in-memory caching to eliminate repeated cross-network DB lookups.
    """
    CACHE_TTL = 60  # Cache valid session for 60 seconds

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

        cache_key = f"auth_session:{token}"
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            user, session = cached_data
            if getattr(user, 'is_banned', False):
                cache.delete(cache_key)
                raise exceptions.PermissionDenied('Account is banned.')
            request.profile_session = session
            return (user, session)

        try:
            session = ProfileSession.objects.select_related('user', 'user__profile').get(
                token=token,
                is_active=True
            )
        except ProfileSession.DoesNotExist:
            raise exceptions.AuthenticationFailed('Invalid or expired session.')

        if session.user.is_banned:
            raise exceptions.PermissionDenied('Account is banned.')

        # Update last seen timestamp lazily (throttled to once every 60 seconds)
        now = timezone.now()
        if not session.last_seen or (now - session.last_seen).total_seconds() > 60:
            session.last_seen = now
            session.save(update_fields=['last_seen'])

        # Store session object on request for downstream usage
        request.profile_session = session
        cache.set(cache_key, (session.user, session), self.CACHE_TTL)

        return (session.user, session)
