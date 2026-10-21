"""Standalone parser tests: python -m unittest tests.test_rate_feed"""
import unittest
from datetime import datetime,timezone,timedelta
from decimal import Decimal
from commerce.rate_feed import (parse_observation,to_decimal,FeedError,fetch_observation,validate_feed_config)

class ParserTests(unittest.TestCase):
    def setUp(self):
        self.now=datetime(2026,10,20,10,30,tzinfo=timezone.utc)
        self.data={'data':{'geram18':{'value':'۱۲۰٬۰۰۰٬۰۰۰','updatedAt':'2026-10-20T10:12:00+00:00'}}}
    def parse(self,unit='RIAL',data=None):
        return parse_observation(data or self.data,price_path='data.geram18.value',
            time_path='data.geram18.updatedAt',unit=unit,now=self.now)
    def test_riyal_to_toman(self):
        self.assertEqual(self.parse().toman_per_gram,Decimal('12000000.00'))
    def test_toman_stays_toman(self):
        self.assertEqual(self.parse(unit='TOMAN').toman_per_gram,Decimal('120000000.00'))
    def test_missing_unit_fails_closed(self):
        with self.assertRaises(FeedError):self.parse(unit='')
    def test_missing_timestamp_fails(self):
        with self.assertRaises(FeedError):self.parse(data={'data':{'geram18':{'value':500}}})
    def test_old_timestamp_fails(self):
        self.data['data']['geram18']['updatedAt']='2026-10-20T08:30:00+00:00'
        with self.assertRaises(FeedError):self.parse()
    def test_timezone_required(self):
        self.data['data']['geram18']['updatedAt']='2026-10-20T10:25:00'
        with self.assertRaises(FeedError):self.parse()
    def test_not_numeric_fails(self):
        self.data['data']['geram18']['value']='بروزرسانی قیمت'
        with self.assertRaises(FeedError):self.parse()
    def test_only_https_known_host(self):
        with self.assertRaises(FeedError):validate_feed_config(url='http://bad.com',allowed_host='bad.com',api_key='abc')
        with self.assertRaises(FeedError):validate_feed_config(url='https://other.com',allowed_host='api.example.org',api_key='abc')

if __name__=='__main__':unittest.main()
