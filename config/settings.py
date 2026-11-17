"""
Django settings for LYNQO project.
Architecture:
- Frontend: Vercel (https://lynqoweb.website)
- Backend: Render (https://<service-name>.onrender.com)
- Database: Neon PostgreSQL
"""

from pathlib import Path
import os
import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")

DEBUG = os.getenv("DEBUG", "False").lower() in ("true", "1", "t")

SECRET_KEY = os.getenv('SECRET_KEY')
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = 'django-insecure-dev-only-change-me'
    else:
        raise RuntimeError('SECRET_KEY environment variable is required in production.')

ALLOWED_HOSTS = [
    "lynqoweb.website",
    "www.lynqoweb.website",
    ".onrender.com",
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "testserver",
]
env_allowed = os.getenv("ALLOWED_HOSTS")
if env_allowed:
    for host in env_allowed.split(","):
        host = host.strip()
        if host and host not in ALLOWED_HOSTS:
            ALLOWED_HOSTS.append(host)

# Application definition
INSTALLED_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'cloudinary_storage',
    'django.contrib.staticfiles',
    'channels',
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    'cloudinary',
    'accounts',
]

AUTH_USER_MODEL = "accounts.User"
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'accounts.middleware.UpdateLastSeenMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'frontend' / 'dist'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

# Database Configuration (Neon PostgreSQL & Local Dev)
DATABASE_URL = os.getenv('DATABASE_URL')
if DATABASE_URL:
    is_neon_pooler = '-pooler' in DATABASE_URL
    db_config = dj_database_url.config(
        default=DATABASE_URL,
        conn_max_age=0 if is_neon_pooler else 600,
        conn_health_checks=True,
        ssl_require=True,
    )
    if 'OPTIONS' not in db_config:
        db_config['OPTIONS'] = {}
    if 'sslmode' not in db_config['OPTIONS']:
        db_config['OPTIONS']['sslmode'] = 'require'

    # When using Neon pooled connection, disable server-side cursors for compatibility with transaction pooling
    if is_neon_pooler:
        db_config['DISABLE_SERVER_SIDE_CURSORS'] = True

    DATABASES = {'default': db_config}
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('DB_NAME', 'lynqo_db'),
            'USER': os.getenv('DB_USER', 'ashique'),
            'PASSWORD': os.getenv('DB_PASSWORD', ''),
            'HOST': os.getenv('DB_HOST', 'localhost'),
            'PORT': os.getenv('DB_PORT', '5433'),
        }
    }

# Channels & Redis Layer
REDIS_URL = os.getenv('REDIS_URL')
if REDIS_URL:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [REDIS_URL],
            },
        },
    }
else:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer"
        }
    }

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'accounts.auth.ProfileSessionAuthentication',
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.AnonRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'user': '120/min',
        'anon': '60/min',
        'auth': '30/min',
    },
    'EXCEPTION_HANDLER': 'accounts.utils.custom_exception_handler',
}

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / "staticfiles"

# Extra place for staticfiles (frontend dist if built)
STATICFILES_DIRS = []
frontend_dist_assets = BASE_DIR / 'frontend' / 'dist' / 'assets'
if frontend_dist_assets.exists():
    STATICFILES_DIRS.append(BASE_DIR / 'frontend' / 'dist')

MEDIA_URL = '/media/'
MEDIA_ROOT = Path(os.getenv('MEDIA_ROOT', BASE_DIR / 'media')).resolve()
MEDIA_ROOT.mkdir(parents=True, exist_ok=True)

# Persistent Media Storage: Cloudinary for Render deployment, FileSystemStorage fallback for local dev
CLOUDINARY_CLOUD_NAME = os.environ.get('CLOUDINARY_CLOUD_NAME')
CLOUDINARY_API_KEY = os.environ.get('CLOUDINARY_API_KEY')
CLOUDINARY_API_SECRET = os.environ.get('CLOUDINARY_API_SECRET')

if CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET:
    import cloudinary
    CLOUDINARY_STORAGE = {
        'CLOUD_NAME': CLOUDINARY_CLOUD_NAME,
        'API_KEY': CLOUDINARY_API_KEY,
        'API_SECRET': CLOUDINARY_API_SECRET,
        'RESOURCE_TYPE': 'auto',
    }
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET,
        secure=True
    )
    STORAGES = {
        "default": {
            "BACKEND": "cloudinary_storage.storage.MediaCloudinaryStorage",
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
        },
    }
else:
    CLOUDINARY_STORAGE = {
        'CLOUD_NAME': 'dummy_cloud',
        'API_KEY': 'dummy_key',
        'API_SECRET': 'dummy_secret',
        'RESOURCE_TYPE': 'auto',
    }
    STORAGES = {
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
        },
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
        },
    }

# CORS & CSRF Settings for Cross-Origin (Vercel Frontend <-> Render Backend)
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = [
    "https://lynqoweb.website",
    "https://www.lynqoweb.website",
    "https://lynqoweb.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

# Allow all Vercel preview deployments and Render domains
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https:\/\/.*\.vercel\.app$",
    r"^https:\/\/.*\.onrender\.com$",
]

env_cors = os.getenv("CORS_ALLOWED_ORIGINS")
if env_cors:
    for orig in env_cors.split(","):
        orig = orig.strip()
        if orig and orig not in CORS_ALLOWED_ORIGINS:
            CORS_ALLOWED_ORIGINS.append(orig)

CSRF_TRUSTED_ORIGINS = [
    "https://lynqoweb.website",
    "https://www.lynqoweb.website",
    "https://lynqoweb.vercel.app",
    "https://*.vercel.app",
    "https://*.onrender.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# Session & Cookie Security:
# Cross-origin cookies (Vercel -> Render) REQUIRE SameSite='None' and Secure=True in production
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'None' if not DEBUG else 'Lax'
SESSION_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_AGE = 60 * 60 * 24 * 365  # 1 year session persistence

CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = 'None' if not DEBUG else 'Lax'
CSRF_COOKIE_SECURE = not DEBUG

VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY')
VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY')
VAPID_ADMIN_EMAIL = os.environ.get('VAPID_ADMIN_EMAIL', 'mailto:admin@lynqoweb.website')
RESEND_API_KEY = os.environ.get('RESEND_API_KEY')

FRONTEND_URL = os.environ.get('FRONTEND_URL', 'https://lynqoweb.website')

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_CONTENT_TYPE_NOSNIFF = True

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO' if DEBUG else 'WARNING',
    },
}
