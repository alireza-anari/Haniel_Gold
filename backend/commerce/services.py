"""Authoritative business operations; requires PostgreSQL transactions in production."""
from __future__ import annotations
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP
import hmac
import hashlib
import secrets

from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.db import transaction, IntegrityError
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError
from .models import (Product,Inventory, GoldRate,PricingPolicy,PriceQuote,QuoteLine,
                     Order,OrderLine,OtpChallenge,RateSyncState)
from .validators import normalize_mobile

class ServiceUnavailable(APIException):
    status_code=503
    default_detail='این سرویس هنوز فعال نیست.'
    default_code='service_unavailable'

class Conflict(APIException):
    status_code=409
    default_detail='وضعیت موجودی یا استعلام تغییر کرده است؛ دوباره تلاش کنید.'
    default_code='conflict'

TOMAN = Decimal('1')
def toman(value):
    return Decimal(value).quantize(TOMAN, rounding=ROUND_HALF_UP)

def calculate_line(product,rate,policy):
    """PROPOSED formula. Only usable after human approval of PricingPolicy.

    Raw = product weight * approved per-karat rate.
    Labor = raw * workmanship% + fixed labor amount.
    Profit = (raw + labor) * profit%.
    Tax = (labor+profit)*reviewed tax% or zero if explicitly approved as none.
    Rounded individually to whole toman; shipping applied per quote, not per item.
    """
    if any(x is None for x in (product.weight_grams,product.karat,
                                product.profit_percent,policy.tax_percent,policy.shipping_toman)) or not policy.tax_basis:
        raise ServiceUnavailable('مشخصات قیمت‌گذاری یا هزینه ارسال هنوز تکمیل و تأیید نشده است.')
    if rate.karat != product.karat:
        raise Conflict('عیار نرخ و محصول مطابقت ندارد.')
    raw=toman(product.weight_grams * rate.toman_per_gram)
    if product.workmanship_percent is None and not product.workmanship_fixed_toman:
        raise ServiceUnavailable('نوع اجرت (درصدی یا ثابت) تنظیم نشده است.')
    labor=toman(raw * (product.workmanship_percent or Decimal('0')) / Decimal('100') + (product.workmanship_fixed_toman or Decimal('0')))
    profit=toman((raw+labor)*product.profit_percent/Decimal('100'))
    taxable = labor+profit if policy.tax_basis=='fee_profit' else Decimal(0)
    tax=toman(taxable*policy.tax_percent/Decimal('100'))
    return {'raw':raw,'labor':labor,'profit':profit,'tax':tax,'total':raw+labor+profit+tax}

@transaction.atomic
def create_quote(user,items):
    if not isinstance(items,list) or not 1<=len(items)<=20:
        raise ValidationError({'items':'حداقل یک و حداکثر بیست محصول لازم است.'})
    if len({line['productId'] for line in items})!=len(items):
        raise ValidationError({'items':'محصول تکراری را در یک ردیف وارد کنید.'})
    rate_state=RateSyncState.objects.select_for_update().filter(pk=1).first()
    if rate_state is None or rate_state.blocked:
        raise ServiceUnavailable('به‌روزرسانی نرخ طلا نیازمند بررسی است؛ استعلام قیمت فعلاً متوقف شده است.')
    policy=PricingPolicy.objects.select_for_update().filter(approved=True).order_by('-approved_at','-id').first()
    if not policy:
        raise ServiceUnavailable('سیاست قیمت‌گذاری هنوز توسط مدیر تأیید نشده است.')
    if any(x is None for x in (policy.tax_percent,policy.shipping_toman)) or not policy.tax_basis:
        raise ServiceUnavailable('پارامترهای قانونی یا هزینه ارسال تأیید نشده‌اند.')
    ids=[i['productId'] for i in items]
    products={p.slug:p for p in Product.objects.select_related('category').filter(slug__in=ids,published=True,category__active=True,photos__isnull=False).distinct()}
    if len(products)!=len(ids):
        raise ValidationError({'items':'یک یا چند محصول معتبر یا منتشرشده نیست.'})
    stock={x.product_id:x for x in Inventory.objects.select_for_update().filter(product__in=products.values())}
    rates={r.karat:r for r in GoldRate.objects.select_for_update().filter(active=True,verified_at__isnull=False,valid_until__gt=timezone.now())}
    summary=[]
    subtotal=Decimal(0)
    tax_total=Decimal(0)
    for item in items:
        product=products[item['productId']]
        if product.karat!=18:
            raise ServiceUnavailable('قیمت‌گذاری خودکار این نسخه تنها برای طلای ۱۸ عیار فعال است.')
        inv=stock.get(product.pk)
        qty=item['quantity']
        if inv is None or inv.available<qty:
            raise Conflict(f'موجودی محصول «{product.name}» کافی نیست.')
        rate=rates.get(product.karat)
        if rate is None:
            raise ServiceUnavailable(f'نرخ تأییدشده برای «{product.name}» ثبت نشده است.')
        breakdown=calculate_line(product,rate,policy)
        subtotal+=(breakdown['raw']+breakdown['labor']+breakdown['profit'])*qty
        tax_total+=breakdown['tax']*qty
        summary.append((product,rate,qty,breakdown))
    shipping=policy.shipping_toman
    quote=PriceQuote.objects.create(user=user,policy=policy,subtotal_toman=subtotal,
        tax_toman=tax_total,shipping_toman=shipping,total_toman=subtotal+tax_total+shipping,
        expires_at=timezone.now()+timedelta(seconds=settings.QUOTE_VALID_SECONDS))
    for p,r,qty,b in summary:
        QuoteLine.objects.create(quote=quote,product=p,rate=r,quantity=qty,
            unit_raw_toman=b['raw'],unit_labor_toman=b['labor'],unit_profit_toman=b['profit'],
            unit_tax_toman=b['tax'],unit_total_toman=b['total'],product_name_snapshot=p.name,
            weight_snapshot=p.weight_grams,karat_snapshot=p.karat)
    return quote

@transaction.atomic
def place_order(user, quote_id, address, idem_key):
    existing=Order.objects.filter(user=user,idempotency_key=idem_key).first()
    if existing:
        if str(existing.quote_id)!=str(quote_id):
            raise Conflict('این شناسه درخواست قبلاً برای استعلام دیگری استفاده شده است.')
        return existing, False
    try:
        quote=PriceQuote.objects.select_for_update().select_related('policy').get(pk=quote_id,user=user)
    except (PriceQuote.DoesNotExist,ValueError,TypeError):
        raise ValidationError({'quoteId':'استعلام معتبر نیست.'})
    rate_state=RateSyncState.objects.select_for_update().filter(pk=1).first()
    if rate_state is None or rate_state.blocked:
        raise ServiceUnavailable('نرخ طلا در حال بررسی است؛ لطفاً بعداً دوباره تلاش کنید.')
    if quote.status!=PriceQuote.State.ACTIVE or quote.expires_at<=timezone.now():
        raise Conflict('استعلام منقضی یا قبلاً استفاده شده است.')
    if not quote.policy.approved or quote.policy.updated_at>quote.created_at:
        raise Conflict('تنظیمات قیمت‌گذاری تغییر کرده‌اند؛ استعلام جدید بگیرید.')
    lines=list(quote.lines.select_related('product','rate').all())
    if not lines:
        raise ValidationError('استعلام بدون کالا معتبر نیست.')
    # Compare old snapshot to currently-approved rate BEFORE stock reservation.
    for line in lines:
        if line.karat_snapshot!=18:
            raise Conflict('استعلام برای عیار تأییدنشده معتبر نیست.')
        current=GoldRate.objects.filter(karat=line.karat_snapshot,active=True,verified_at__isnull=False,valid_until__gt=timezone.now()).first()
        if current is None or (current.pk!=line.rate_id and current.toman_per_gram!=line.rate.toman_per_gram):
            raise Conflict('نرخ طلا تغییر کرده است؛ قیمت را دوباره استعلام کنید.')
        if not line.product.published:
            raise Conflict('یکی از محصولات دیگر قابل سفارش نیست.')
    inventories={x.product_id:x for x in Inventory.objects.select_for_update().filter(
        product_id__in=sorted([ln.product_id for ln in lines])).order_by('product_id')}
    for ln in lines:
        inv=inventories.get(ln.product_id)
        if inv is None or inv.available<ln.quantity:
            raise Conflict('موجودی تغییر کرده است؛ دوباره استعلام بگیرید.')
    address_snapshot={'receiverName':address.receiver_name,'receiverMobile':address.receiver_mobile,
        'province':address.province,'city':address.city,'addressLine':address.address_line,
        'postalCode':address.postal_code}
    try:
        order=Order.objects.create(user=user,quote=quote,idempotency_key=idem_key,
            shipping_snapshot=address_snapshot,total_toman=quote.total_toman,
            reservation_expires_at=timezone.now()+timedelta(seconds=settings.ORDER_HOLD_SECONDS))
    except IntegrityError:
        raise Conflict('سفارش تکراری است؛ وضعیت سفارش را دریافت کنید.')
    for ln in lines:
        OrderLine.objects.create(order=order,product=ln.product,quantity=ln.quantity,
            product_name_snapshot=ln.product_name_snapshot,unit_total_toman=ln.unit_total_toman,
            weight_snapshot=ln.weight_snapshot,karat_snapshot=ln.karat_snapshot)
        inv=inventories[ln.product_id]
        inv.reserved+=ln.quantity
        inv.save(update_fields=['reserved','updated_at'])
    quote.status=PriceQuote.State.USED
    quote.save(update_fields=['status'])
    return order,True

@transaction.atomic
def expire_unpaid_order(order_id):
    order=Order.objects.select_for_update().get(pk=order_id)
    if order.status!=Order.State.PENDING or order.reservation_expires_at>timezone.now():
        return False
    lines=list(order.lines.all())
    invs={inv.product_id:inv for inv in Inventory.objects.select_for_update().filter(
        product_id__in=sorted([l.product_id for l in lines])).order_by('product_id')}
    for line in lines:
        inv=invs[line.product_id]
        inv.reserved-=line.quantity
        if inv.reserved<0:raise Conflict('مغایرت موجودی رزروشده؛ نیازمند بررسی مدیر.')
        inv.save(update_fields=['reserved','updated_at'])
    order.status=Order.State.EXPIRED
    order.save(update_fields=['status','updated_at'])
    return True

@transaction.atomic
def confirm_verified_payment(order_id, provider, reference, verified_payload):
    """Call ONLY after authenticated server-to-server verification by a real adapter.

    Never call directly from a browser callback without provider verification.
    No provider adapter shipped in this phase.
    """
    raise ServiceUnavailable('اتصال درگاه و تأیید تراکنش هنوز انجام نشده است.')


def send_sms(mobile,code):
    backend=settings.SMS_BACKEND
    if backend=='console' and settings.DEBUG:
        import logging
        logging.getLogger('haniel.dev_sms').warning('DEVELOPMENT OTP for %s: %s',mobile,code)
        return
    raise ServiceUnavailable('ارسال پیامک فعال نیست؛ تا اتصال ارائه‌دهنده امکان ورود وجود ندارد.')


def hash_ip(ip):
    return hmac.new(settings.SECRET_KEY.encode(),str(ip).encode(),hashlib.sha256).hexdigest()

def issue_otp(mobile,ip):
    mobile=normalize_mobile(mobile)
    now=timezone.now()
    ip_hash=hash_ip(ip)
    if OtpChallenge.objects.filter(mobile=mobile,created_at__gte=now-timedelta(hours=1)).count()>=5:
        raise Conflict('تعداد درخواست پیامک بیش از حد مجاز است. بعداً تلاش کنید.')
    if OtpChallenge.objects.filter(ip_hash=ip_hash,created_at__gte=now-timedelta(hours=1)).count()>=15:
        raise Conflict('تعداد درخواست از این اتصال بیش از حد مجاز است.')
    if OtpChallenge.objects.filter(mobile=mobile,created_at__gte=now-timedelta(seconds=60)).exists():
        raise Conflict('برای درخواست کد جدید کمی صبر کنید.')
    if settings.SMS_BACKEND=='disabled':
        raise ServiceUnavailable('درگاه پیامک هنوز تنظیم نشده است.')
    code=f'{secrets.randbelow(1000000):06d}'
    challenge=OtpChallenge.objects.create(mobile=mobile,ip_hash=ip_hash,
        code_hash=hmac.new(settings.SECRET_KEY.encode(),f'{mobile}:{code}'.encode(),hashlib.sha256).hexdigest(),
        expires_at=now+timedelta(minutes=5))
    try:
        send_sms(mobile,code)
    except Exception:
        challenge.delete()
        raise
    return challenge

def verify_otp(request,mobile,code):
    """Persist failed attempts even when returning an error (critical for lockout)."""
    mobile=normalize_mobile(mobile)
    verified=False
    with transaction.atomic():
        challenge=OtpChallenge.objects.select_for_update().filter(mobile=mobile,consumed_at__isnull=True).first()
        if challenge is None or challenge.expires_at<=timezone.now() or challenge.attempts>=5:
            raise ValidationError({'code':'کد معتبر نیست یا منقضی شده است.'})
        challenge.attempts+=1
        expected=hmac.new(settings.SECRET_KEY.encode(),f'{mobile}:{code}'.encode(),hashlib.sha256).hexdigest()
        verified=hmac.compare_digest(challenge.code_hash,expected)
        if verified:
            challenge.consumed_at=timezone.now()
            challenge.save(update_fields=['attempts','consumed_at'])
        else:
            challenge.save(update_fields=['attempts'])
    if not verified:
        raise ValidationError({'code':'کد تأیید نشد.'})
    User=get_user_model()
    user,created=User.objects.get_or_create(username=mobile,defaults={'is_active':True})
    if not user.is_active:
        raise ValidationError('حساب غیرفعال است.')
    login(request,user,backend='django.contrib.auth.backends.ModelBackend')
    return user
