"""Servix official 18K Iranian gold rate client.

GET https://servix.cc/api/v1/assets/GOLD_18_RLS
X-API-Key: (server-only secret)
Response: {code, quoteUnit: 'RLS', value, businessTime}

No API key, response data or user information should be sent to the browser.
"""
import json
from decimal import Decimal

import requests

from .rate_feed import FeedError, Observation, parse_observation

SERVIX_ENDPOINT = 'https://servix.cc/api/v1/assets/GOLD_18_RLS'
SERVIX_CODE = 'GOLD_18_RLS'


class ServixAPIError(FeedError):
    def __init__(self, code, message, request_id=None):
        super().__init__(message)
        self.code = code
        self.request_id = request_id


class ServixQuotaExceeded(ServixAPIError):
    pass


def parse_servix(data, *, now=None, max_age_seconds=2400):
    """Strictly require the documented symbol and quotation unit.

    Uses `value` (current quote) rather than a buy/sell quote, which may be null.
    Converts *rial/gram* to *toman/gram* using Decimal, never binary floats.
    """
    if not isinstance(data, dict):
        raise FeedError('پاسخ Servix باید یک رکورد JSON باشد.')
    if data.get('code') != SERVIX_CODE:
        raise FeedError('نماد پاسخ Servix با طلای ۱۸ عیار مطابقت ندارد.')
    if data.get('quoteUnit') != 'RLS':
        raise FeedError('واحد پاسخ Servix ریال اعلام نشده است.')
    if data.get('stale') is True:
        raise FeedError('Servix این نرخ را قدیمی علامت زده است.')
    return parse_observation(data, price_path='value', time_path='businessTime',
                             unit='RIAL', now=now, max_age_seconds=max_age_seconds)


def fetch_servix_rate(*, api_key, max_age_seconds=2400, requester=None, now=None):
    if not isinstance(api_key, str) or not api_key.strip():
        raise ServixAPIError('NOT_CONFIGURED', 'کلید API سرویکس در تنظیمات سرور وجود ندارد.')
    requester = requester or requests.get
    try:
        response = requester(
            SERVIX_ENDPOINT,
            headers={'X-API-Key': api_key.strip(), 'Accept': 'application/json'},
            timeout=(5, 10),
            allow_redirects=False,
        )
    except requests.RequestException as exc:
        raise ServixAPIError('NETWORK_ERROR', 'ارتباط با Servix برقرار نشد.') from exc

    # Header is only diagnostic metadata and never contains secrets.
    rid = response.headers.get('X-Request-Id', '') if hasattr(response, 'headers') else ''
    rid = rid[:128] if isinstance(rid, str) else ''
    if response.status_code == 429:
        raise ServixQuotaExceeded('DAILY_LIMIT_EXCEEDED', 'سهمیه روزانه Servix تمام شده است.', rid)
    if response.status_code in (401, 403):
        raise ServixAPIError('AUTH_OR_ACCESS', 'کلید یا دسترسی حساب Servix معتبر نیست.', rid)
    if response.status_code != 200:
        raise ServixAPIError(f'HTTP_{response.status_code}',
                             'Servix نرخ موفق برنگرداند.', rid)
    if len(response.content) > 256_000:
        raise ServixAPIError('RESPONSE_TOO_LARGE', 'پاسخ Servix بیش از حد بزرگ است.', rid)
    try:
        data = json.loads(response.content.decode('utf-8'), parse_float=Decimal)
    except (ValueError, UnicodeError) as exc:
        raise ServixAPIError('INVALID_JSON', 'پاسخ Servix JSON معتبر نیست.', rid) from exc
    try:
        return parse_servix(data, now=now, max_age_seconds=max_age_seconds)
    except FeedError as exc:
        raise ServixAPIError('INVALID_RATE', str(exc), rid) from exc
