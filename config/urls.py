import os
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.views.static import serve
from django.http import JsonResponse, FileResponse

def health_check(request):
    db_ok = True
    try:
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception:
        db_ok = False

    redis_ok = True
    try:
        from django.core.cache import cache
        cache.set('health_test', 1, 5)
        redis_ok = cache.get('health_test') == 1
    except Exception:
        redis_ok = False

    overall = db_ok
    status_code = 200 if overall else 503
    return JsonResponse({
        'status': 'ok' if overall else 'degraded',
        'app': 'LYNQO',
        'database': 'connected' if db_ok else 'error',
        'cache': 'connected' if redis_ok else 'degraded',
    }, status=status_code)

def serve_spa(request):
    index_path = settings.BASE_DIR / 'frontend' / 'dist' / 'index.html'
    if index_path.exists():
        return FileResponse(open(index_path, 'rb'), content_type='text/html')
    return JsonResponse({'status': 'ok', 'message': 'LYNQO Backend Active. Frontend build not found.'})

urlpatterns = [
    path('admin/', admin.site.urls),
    path('health/', health_check),
    path('api/health/', health_check),
    path('api/auth/', include('accounts.urls')),
    # Private media must be accessed through authenticated message endpoints.
    re_path(r'^assets/(?P<path>.*)$', serve, {'document_root': settings.BASE_DIR / 'frontend' / 'dist' / 'assets'}),
    re_path(r'^(?!api|admin|media|static|ws|health).*$', serve_spa),
]
