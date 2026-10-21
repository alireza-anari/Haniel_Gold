"""HANI-EL GOLD: PostgreSQL only in normal environments; SQLite for isolated tests."""
from pathlib import Path
import os
from dotenv import load_dotenv
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')
DEBUG = os.getenv('DJANGO_DEBUG', '0') == '1'
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', '')
if not DEBUG and (len(SECRET_KEY) < 40 or any(p in SECRET_KEY.upper() for p in ('REPLACE', 'GENERATE', 'CHANGE-ME', 'DEBUG-ONLY'))):
    raise ImproperlyConfigured('Use a strong randomly generated DJANGO_SECRET_KEY in production')
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = 'debug-only-unsafe-set-an-env-secret-before-deploy'
    else:
        raise ImproperlyConfigured('DJANGO_SECRET_KEY must be set when DEBUG=0')
ALLOWED_HOSTS = [x.strip() for x in os.getenv('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') if x.strip()]
CSRF_TRUSTED_ORIGINS = [x.strip() for x in os.getenv('DJANGO_CSRF_TRUSTED_ORIGINS', '').split(',') if x.strip()]
INSTALLED_APPS = [
    'django.contrib.admin', 'django.contrib.auth', 'django.contrib.contenttypes',
    'django.contrib.sessions', 'django.contrib.messages', 'django.contrib.staticfiles',
    'rest_framework', 'commerce',
]
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]
ROOT_URLCONF = 'config.urls'
TEMPLATES = [{'BACKEND':'django.template.backends.django.DjangoTemplates',
              'DIRS':[], 'APP_DIRS':True,
              'OPTIONS':{'context_processors':[
                  'django.template.context_processors.debug',
                  'django.template.context_processors.request',
                  'django.contrib.auth.context_processors.auth',
                  'django.contrib.messages.context_processors.messages']}}]
WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'
if os.getenv('HANIEL_TEST_SQLITE') == '1':
    DATABASES = {'default': {'ENGINE':'django.db.backends.sqlite3','NAME':BASE_DIR / 'test.sqlite3'}}
else:
    if not DEBUG and (not os.getenv('POSTGRES_PASSWORD') or any(p in os.getenv('POSTGRES_PASSWORD','').upper() for p in ('REPLACE', 'CHANGE-ME', 'GENERATE'))):
        raise ImproperlyConfigured('Set a strong POSTGRES_PASSWORD in production')
    DATABASES = {'default': {
        'ENGINE':'django.db.backends.postgresql',
        'NAME':os.getenv('POSTGRES_DB', 'haniel'),
        'USER':os.getenv('POSTGRES_USER', 'haniel'),
        'PASSWORD':os.getenv('POSTGRES_PASSWORD', ''),
        'HOST':os.getenv('POSTGRES_HOST', 'localhost'),
        'PORT':os.getenv('POSTGRES_PORT', '5432'),
        'CONN_MAX_AGE':60,
        'CONN_HEALTH_CHECKS':True,
        'OPTIONS': {'connect_timeout':5},
    }}
AUTH_PASSWORD_VALIDATORS = [
    {'NAME':'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME':'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME':'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME':'django.contrib.auth.password_validation.NumericPasswordValidator'},
]
LANGUAGE_CODE = 'fa'
TIME_ZONE = 'Asia/Tehran'
USE_I18N = True
USE_TZ = True
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework.authentication.SessionAuthentication'],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer'],
    'DEFAULT_THROTTLE_CLASSES': ['rest_framework.throttling.AnonRateThrottle','rest_framework.throttling.UserRateThrottle'],
    'DEFAULT_THROTTLE_RATES': {'anon':'60/min', 'user':'180/min', 'otp':'5/hour', 'support':'5/hour'},
}
# CSRF cookie stays readable to the same-origin frontend; SESSION cookie is HttpOnly.
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_AGE = 86400
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'
SECURE_HSTS_SECONDS = int(os.getenv('DJANGO_HSTS_SECONDS', '2592000')) if not DEBUG else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = os.getenv('DJANGO_HSTS_INCLUDE_SUBDOMAINS', '0') == '1' and not DEBUG
SECURE_SSL_REDIRECT = not DEBUG and os.getenv('DJANGO_SECURE_SSL_REDIRECT','1') == '1'
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https') if os.getenv('TRUST_REVERSE_PROXY') == '1' else None
X_FRAME_OPTIONS = 'DENY'
# Console SMS is an explicit development-only tool; never use in production.
SMS_BACKEND = os.getenv('SMS_BACKEND', 'disabled')
if SMS_BACKEND == 'console' and not DEBUG:
    raise ImproperlyConfigured('Console OTP cannot be enabled in production')
QUOTE_VALID_SECONDS = min(max(int(os.getenv('QUOTE_VALID_SECONDS','600')),60),3600)
ORDER_HOLD_SECONDS = min(max(int(os.getenv('ORDER_HOLD_SECONDS','900')),60),3600)

# Automatic, licensed gold price feed. All prices are explicitly TOMAN per gram.
# No URL or token supplied by default; unconfigured integration fails closed.
GOLD_FEED_URL = os.getenv('GOLD_FEED_URL','')
GOLD_FEED_ALLOWED_HOST = os.getenv('GOLD_FEED_ALLOWED_HOST','')
GOLD_FEED_API_KEY = os.getenv('GOLD_FEED_API_KEY','')
GOLD_FEED_AUTH_HEADER = os.getenv('GOLD_FEED_AUTH_HEADER','Authorization')
GOLD_FEED_AUTH_PREFIX = os.getenv('GOLD_FEED_AUTH_PREFIX','Bearer ')
GOLD_FEED_VALUE_PATH = os.getenv('GOLD_FEED_VALUE_PATH','')
GOLD_FEED_TIMESTAMP_PATH = os.getenv('GOLD_FEED_TIMESTAMP_PATH','')
GOLD_FEED_UNIT = os.getenv('GOLD_FEED_UNIT','') # TOMAN or RIAL - required
GOLD_FEED_PROVIDER_NAME = os.getenv('GOLD_FEED_PROVIDER_NAME','servix')
SERVIX_API_KEY = os.getenv('SERVIX_API_KEY','')
GOLD_FEED_MAX_SOURCE_AGE_SECONDS = int(os.getenv('GOLD_FEED_MAX_SOURCE_AGE_SECONDS','2400'))
GOLD_FEED_VALID_SECONDS = int(os.getenv('GOLD_FEED_VALID_SECONDS','2700'))
GOLD_FEED_MAX_CHANGE_PERCENT = os.getenv('GOLD_FEED_MAX_CHANGE_PERCENT','5')
