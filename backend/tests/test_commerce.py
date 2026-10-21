"""Run: HANIEL_TEST_SQLITE=1 python manage.py test tests (PostgreSQL additionally required for race tests)."""
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase,override_settings
from django.utils import timezone
from rest_framework.exceptions import APIException,ValidationError
from commerce.models import (Address,Category,Product,ProductImage,Inventory,GoldRate,
    PricingPolicy,PriceQuote,Order,OtpChallenge,RateSyncState)
from commerce.services import (calculate_line,create_quote,place_order,expire_unpaid_order,
    issue_otp,verify_otp,ServiceUnavailable,Conflict)

class FinancialTests(TestCase):
    def setUp(self):
        RateSyncState.objects.create(id=1,blocked=False)
        self.user=get_user_model().objects.create_user(username='09120000000',password='test-password')
        self.cat=Category.objects.create(slug='necklace',title='گردنبند')
        self.p=Product.objects.create(slug='real-sku-1',name='قطعه نمونه آزمون',category=self.cat,
            style='minimal',published=True,weight_grams=Decimal('0.1250'),karat=18,
            workmanship_percent=Decimal('10'),profit_percent=Decimal('5'))
        Inventory.objects.create(product=self.p,on_hand=4)
        ProductImage.objects.create(product=self.p,url='https://example.invalid/test.webp',alt='نمای آزمایشی محصول')
        self.rate=GoldRate.objects.create(karat=18,toman_per_gram=Decimal('10000000'),
            source_note='only test value, not a market quote',active=True,
            verified_at=timezone.now(),valid_until=timezone.now()+timedelta(hours=1),verified_by=self.user)
        self.policy=PricingPolicy.objects.create(approved=True,approved_at=timezone.now(),approved_by=self.user,
            tax_percent=Decimal('0'),tax_basis='none',shipping_toman=Decimal('0'),
            notes_internal='test values only')
        self.address=Address.objects.create(user=self.user,receiver_name='گیرنده آزمایشی',
            receiver_mobile='09120000000',province='تهران',city='تهران',
            address_line='نشانی آزمایشی',postal_code='1234567890')

    def test_decimal_breakdown(self):
        calc=calculate_line(self.p,self.rate,self.policy)
        self.assertEqual(calc['raw'],Decimal(1250000))
        self.assertEqual(calc['labor'],Decimal(125000))
        self.assertEqual(calc['profit'],Decimal(68750))
        self.assertEqual(calc['total'],Decimal(1443750))

    def test_quote_does_not_reserve_and_order_does(self):
        q=create_quote(self.user,[{'productId':'real-sku-1','quantity':2}])
        self.assertEqual(q.total_toman,Decimal(2887500))
        self.p.inventory.refresh_from_db()
        self.assertEqual(self.p.inventory.reserved,0)
        order,created=place_order(self.user,q.id,self.address,'my-unique-order-01')
        self.assertTrue(created)
        self.p.inventory.refresh_from_db()
        self.assertEqual(self.p.inventory.available,2)
        order2,created2=place_order(self.user,q.id,self.address,'my-unique-order-01')
        self.assertFalse(created2)
        self.assertEqual(order2.pk,order.pk)
        self.assertEqual(Order.objects.count(),1)

    def test_cannot_reuse_quote_with_new_idempotency_key(self):
        q=create_quote(self.user,[{'productId':'real-sku-1','quantity':1}])
        place_order(self.user,q.id,self.address,'unique-request-0001')
        with self.assertRaises(Conflict):
            place_order(self.user,q.id,self.address,'unique-request-0002')

    def test_stock_shortage_prevents_order_and_no_reservation_leak(self):
        q=create_quote(self.user,[{'productId':'real-sku-1','quantity':2}])
        inv=Inventory.objects.get(product=self.p)
        inv.on_hand=1;inv.save()
        with self.assertRaises(Conflict):
            place_order(self.user,q.id,self.address,'unique-request-0003')
        inv.refresh_from_db()
        self.assertEqual(inv.reserved,0)

    def test_rate_change_invalidates_quote(self):
        q=create_quote(self.user,[{'productId':'real-sku-1','quantity':1}])
        self.rate.active=False;self.rate.save()
        new_rate=GoldRate.objects.create(karat=18,toman_per_gram=Decimal('11000000'),
            source_note='test change',active=True,verified_at=timezone.now(),valid_until=timezone.now()+timedelta(hours=1),verified_by=self.user)
        with self.assertRaises(Conflict):
            place_order(self.user,q.id,self.address,'unique-request-0004')

    def test_expired_reservation_released(self):
        q=create_quote(self.user,[{'productId':'real-sku-1','quantity':2}])
        order,_=place_order(self.user,q.id,self.address,'unique-request-0005')
        order.reservation_expires_at=timezone.now()-timedelta(seconds=1)
        order.save(update_fields=['reservation_expires_at'])
        self.assertTrue(expire_unpaid_order(order.pk))
        self.p.inventory.refresh_from_db()
        self.assertEqual(self.p.inventory.reserved,0)

    def test_quote_disabled_by_default_without_policy(self):
        self.policy.approved=False;self.policy.save()
        with self.assertRaises(ServiceUnavailable):
            create_quote(self.user,[{'productId':'real-sku-1','quantity':1}])

class ApiTests(FinancialTests):
    def test_products_match_frontend_contract(self):
        response=self.client.get('/v1/catalog/products?limit=100', secure=True)
        self.assertEqual(response.status_code,200)
        obj=response.json()['items'][0]
        self.assertEqual(obj['id'],'real-sku-1')
        self.assertEqual(obj['category'],'گردنبند')
        self.assertEqual(obj['images'],['https://example.invalid/test.webp'])
        self.assertEqual(obj['price']['amountToman'],1443750)

    def test_anonymous_orders_rejected(self):
        response=self.client.post('/v1/orders',data='{}',content_type='application/json', secure=True)
        self.assertIn(response.status_code,(401,403))

    def test_quote_api_authenticated(self):
        self.client.force_login(self.user)
        response=self.client.post('/v1/cart/quote',data='{"items":[{"productId":"real-sku-1","quantity":1}]}',content_type='application/json', secure=True)
        self.assertEqual(response.status_code,201)
        self.assertEqual(response.json()['currency'],'TOMAN')

    def test_payment_not_faked(self):
        self.client.force_login(self.user)
        response=self.client.post('/v1/payments/start',data='{}',content_type='application/json', secure=True)
        self.assertEqual(response.status_code,503)

    def test_other_user_cannot_read_order(self):
        q=create_quote(self.user,[{'productId':'real-sku-1','quantity':1}])
        order,_=place_order(self.user,q.id,self.address,'unique-request-0006')
        other=get_user_model().objects.create_user(username='09121111111',password='some-password')
        self.client.force_login(other)
        self.assertEqual(self.client.get(f'/v1/orders/{order.id}', secure=True).status_code,404)

class OtpTests(TestCase):
    @override_settings(SMS_BACKEND='disabled')
    def test_otp_disabled_returns_unavailable(self):
        with self.assertRaises(ServiceUnavailable):issue_otp('09120000000','127.0.0.1')
        self.assertEqual(OtpChallenge.objects.count(),0)

    @override_settings(SMS_BACKEND='console',DEBUG=True)
    def test_wrong_otp_consumes_attempt(self):
        with patch('commerce.services.send_sms'),patch('commerce.services.secrets.randbelow',return_value=222222):
            issue_otp('09120000000','127.0.0.1')
        challenge=OtpChallenge.objects.first()
        class Req:
            session={}
        with self.assertRaises(ValidationError):
            verify_otp(Req(),'09120000000','111111')
        challenge.refresh_from_db()
        self.assertEqual(challenge.attempts,1)
