"""Run through Django: python manage.py test tests.test_rate_service.
Never fetches a live market quote; all numbers below are test fixtures only.
"""
from unittest.mock import patch
from datetime import timedelta
from decimal import Decimal
from django.test import TestCase,override_settings
from django.utils import timezone
from django.contrib.auth import get_user_model
from commerce.models import (GoldRate,RateSyncState,RateSyncAttempt,Product,Category,
                             ProductImage,Inventory,PricingPolicy)
from commerce.rate_service import sync_gold_rate,approve_reviewed_candidate,current_pricing_context
from commerce.rate_feed import Observation
from commerce.servix import ServixQuotaExceeded
from commerce.services import calculate_line

@override_settings(GOLD_FEED_PROVIDER_NAME='fake-provider',
                   GOLD_FEED_MAX_SOURCE_AGE_SECONDS=2400,
                   GOLD_FEED_VALID_SECONDS=2700,
                   GOLD_FEED_MAX_CHANGE_PERCENT='5')
class RateAcceptanceTests(TestCase):
    def setUp(self):
        self.admin=get_user_model().objects.create_superuser('admin-example',password='test-only-pass',email='admin@example.invalid')
        self.now=timezone.now()
    def observation(self,value,minutes=0):
        return Observation(Decimal(value),timezone.now()-timedelta(minutes=minutes))
    def test_bootstrap_needs_human_review(self):
        result=sync_gold_rate(observation=self.observation('10000000'))
        self.assertEqual(result['status'],'rejected')
        self.assertEqual(GoldRate.objects.count(),0)
        self.assertTrue(RateSyncState.objects.get(pk=1).blocked)
        rejected=RateSyncAttempt.objects.get(status='rejected')
        approved=approve_reviewed_candidate(rejected.pk,self.admin)
        self.assertEqual(approved,Decimal('10000000'))
        self.assertFalse(RateSyncState.objects.get(pk=1).blocked)
    def activate_first(self):
        sync_gold_rate(observation=self.observation('10000000',minutes=1))
        approve_reviewed_candidate(RateSyncAttempt.objects.get(status='rejected').pk,self.admin)
    def test_auto_rate_update_and_price_calculation(self):
        self.activate_first()
        r=sync_gold_rate(observation=self.observation('10100000'))
        self.assertEqual(r['status'],'accepted')
        self.assertEqual(GoldRate.objects.filter(active=True).count(),1)
        self.assertEqual(GoldRate.objects.get(active=True).toman_per_gram,Decimal('10100000'))
        self.assertEqual(RateSyncAttempt.objects.filter(status='accepted').count(),2)
    def test_duplicate_feed_does_not_extend_expiry(self):
        self.activate_first()
        active=GoldRate.objects.get(active=True)
        res=sync_gold_rate(observation=Observation(active.toman_per_gram,active.source_observed_at))
        self.assertEqual(res['status'],'unchanged')
        self.assertEqual(GoldRate.objects.count(),1)
        self.assertFalse(RateSyncState.objects.get(pk=1).blocked)
    def test_large_jump_blocks_quotes(self):
        self.activate_first()
        r=sync_gold_rate(observation=self.observation('11500000'))
        self.assertEqual(r['status'],'rejected')
        self.assertTrue(RateSyncState.objects.get(pk=1).blocked)
        self.assertEqual(GoldRate.objects.get(active=True).toman_per_gram,Decimal('10000000'))
        self.assertEqual(current_pricing_context()[2],'blocked')
    def test_fixed_workmanship_without_percent(self):
        category=Category.objects.create(title='گروه نمونه',slug='sample-test')
        product=Product.objects.create(name='محصول نمونه',slug='test-one',category=category,
             style='minimal',weight_grams=Decimal('2'),karat=18,workmanship_percent=None,
             workmanship_fixed_toman=Decimal('150000'),profit_percent=Decimal('5'))
        rate=GoldRate(karat=18,toman_per_gram=Decimal('1000000'))
        policy=PricingPolicy(tax_basis='none',tax_percent=Decimal('0'),shipping_toman=0)
        parts=calculate_line(product,rate,policy)
        self.assertEqual(parts['raw'],Decimal('2000000'))
        self.assertEqual(parts['labor'],Decimal('150000'))
        self.assertEqual(parts['profit'],Decimal('107500'))
        self.assertEqual(parts['total'],Decimal('2257500'))


@override_settings(GOLD_FEED_PROVIDER_NAME='servix', SERVIX_API_KEY='test_only_key')
class ServixQuotaDatabaseTests(TestCase):
    @patch('commerce.rate_service.fetch_servix_rate', side_effect=ServixQuotaExceeded(
        'DAILY_LIMIT_EXCEEDED', 'سهمیه روزانه تمام شده است.'))
    def test_quota_error_pauses_next_attempt_for_24h(self, transport):
        first=sync_gold_rate()
        self.assertEqual(first['status'],'quota_exceeded')
        state=RateSyncState.objects.get(pk=1)
        self.assertEqual(state.pause_reason,'daily_quota_exceeded')
        self.assertTrue(state.paused_until>timezone.now()+timedelta(hours=23))
        self.assertEqual(RateSyncAttempt.objects.count(),1)
        second=sync_gold_rate()
        self.assertEqual(second['status'],'paused')
        transport.assert_called_once()
        self.assertEqual(RateSyncAttempt.objects.count(),1)
