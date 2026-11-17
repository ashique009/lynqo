import os
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.views.static import serve
from django.http import JsonResponse, FileResponse

def health_check(request):
    return JsonResponse({'status': 'ok', 'app': 'LYNQO', 'service': 'healthy'})

def serve_spa(request):
    index_path = settings.BASE_DIR / 'frontend' / 'dist' / 'index.html'
    if index_path.exists():
        return FileResponse(open(index_path, 'rb'), content_type='text/html')
    return JsonResponse({'status': 'ok', 'message': 'LYNQO Backend Active. Frontend build not found.'})

urlpatterns = [
    path('admin/', admin.site.urls),
    path('health/', health_check),
    path('api/auth/', include('accounts.urls')),
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    re_path(r'^assets/(?P<path>.*)$', serve, {'document_root': settings.BASE_DIR / 'frontend' / 'dist' / 'assets'}),
    re_path(r'^(?!api|admin|media|static|ws|health).*$', serve_spa),
]
