"""Self-contained adapter tests: python -m unittest tests.test_servix"""
import json
import unittest
from datetime import datetime, timezone, timedelta
from decimal import Decimal

import requests

from commerce.rate_feed import FeedError
from commerce.servix import (
    SERVIX_ENDPOINT, ServixAPIError, ServixQuotaExceeded,
    fetch_servix_rate, parse_servix,
)


class FakeResponse:
    def __init__(self, data=None, status=200, headers=None):
        self.status_code = status
        self.headers = headers or {}
        self.content = json.dumps(data if data is not None else {}).encode('utf-8')


class ServixTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 21, 10, 30, tzinfo=timezone.utc)
        self.data = {
            'code': 'GOLD_18_RLS',
            'quoteUnit': 'RLS',
            'value': '123456780',  # Synthetic fixture, NOT a real gold rate.
            'businessTime': (self.now - timedelta(minutes=5)).isoformat(),
            'midPrice': None,
        }

    def test_correct_conversion(self):
        result = parse_servix(self.data, now=self.now)
        self.assertEqual(result.toman_per_gram, Decimal('12345678.00'))
        self.assertEqual(result.observed_at, self.now - timedelta(minutes=5))

    def test_invalid_asset_fails(self):
        data = {**self.data, 'code': 'GOLD_24_RLS'}
        with self.assertRaises(FeedError):
            parse_servix(data, now=self.now)

    def test_currency_unit_cannot_be_assumed(self):
        for unit in ['TOMAN', 'USD', '', None]:
            with self.subTest(unit=unit), self.assertRaises(FeedError):
                parse_servix({**self.data, 'quoteUnit': unit}, now=self.now)

    def test_timestamp_is_required_and_fresh(self):
        with self.assertRaises(FeedError):
            parse_servix({**self.data, 'businessTime': '2026-10-18T10:30:00Z'}, now=self.now)
        with self.assertRaises(FeedError):
            parse_servix({**self.data, 'businessTime': None}, now=self.now)

    def test_declared_stale_is_rejected(self):
        with self.assertRaises(FeedError):
            parse_servix({**self.data, 'stale': True}, now=self.now)

    def test_calls_exact_url_and_key_in_header(self):
        requests_made = []
        def requester(url, **kwargs):
            requests_made.append((url, kwargs))
            return FakeResponse(self.data)
        result = fetch_servix_rate(api_key='my_test_key', requester=requester, now=self.now)
        self.assertEqual(result.toman_per_gram, Decimal('12345678.00'))
        self.assertEqual(requests_made[0][0], SERVIX_ENDPOINT)
        self.assertEqual(requests_made[0][1]['headers']['X-API-Key'], 'my_test_key')
        self.assertFalse(requests_made[0][1]['allow_redirects'])
        self.assertNotIn('my_test_key', requests_made[0][0])

    def test_quota_exhaustion_is_distinct(self):
        with self.assertRaises(ServixQuotaExceeded) as caught:
            fetch_servix_rate(api_key='secret', requester=lambda *a, **kw:
                FakeResponse(status=429, headers={'X-Request-Id':'req_abc'}), now=self.now)
        self.assertEqual(caught.exception.code, 'DAILY_LIMIT_EXCEEDED')
        self.assertEqual(caught.exception.request_id, 'req_abc')

    def test_401_has_safe_error(self):
        with self.assertRaises(ServixAPIError) as caught:
            fetch_servix_rate(api_key='secret', requester=lambda *a, **kw:
                FakeResponse(status=401), now=self.now)
        self.assertEqual(caught.exception.code, 'AUTH_OR_ACCESS')
        self.assertNotIn('secret', str(caught.exception))

    def test_network_errors_are_safe(self):
        def request_fail(*a, **kw):
            raise requests.Timeout('connection issue with secrets')
        with self.assertRaises(ServixAPIError) as caught:
            fetch_servix_rate(api_key='secret', requester=request_fail, now=self.now)
        self.assertEqual(caught.exception.code, 'NETWORK_ERROR')
        self.assertNotIn('secret', str(caught.exception))

    def test_reject_redirect_and_invalid_json(self):
        for code in [301, 302, 307, 308]:
            with self.subTest(code=code), self.assertRaises(ServixAPIError):
                fetch_servix_rate(api_key='secret', requester=lambda *a, **kw:
                    FakeResponse(status=code), now=self.now)
        bad = FakeResponse(status=200)
        bad.content = b'not json'
        with self.assertRaises(ServixAPIError):
            fetch_servix_rate(api_key='secret', requester=lambda *a, **kw: bad, now=self.now)

    def test_empty_key_does_not_call_network(self):
        with self.assertRaises(ServixAPIError) as caught:
            fetch_servix_rate(api_key='', requester=lambda *a, **kw:
                self.fail('network must not be called'), now=self.now)
        self.assertEqual(caught.exception.code, 'NOT_CONFIGURED')


if __name__ == '__main__':
    unittest.main()
