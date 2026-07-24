from django.utils import timezone
from django.core.cache import cache


class UpdateLastSeenMiddleware:
    THROTTLE_SECONDS = 60

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.user.is_authenticated:
            cache_key = f'last_seen_updated:{request.user.id}'
            if not cache.get(cache_key):
                from .models import User
                User.objects.filter(id=request.user.id).update(last_seen=timezone.now())
                cache.set(cache_key, True, self.THROTTLE_SECONDS)
        return response
