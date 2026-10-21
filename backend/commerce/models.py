"""All financial fields are Decimal, in Iranian toman; never float or client-priced."""
import uuid
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models
from django.db.models import Q, F
from django.utils import timezone
from .validators import https_url, normalize_mobile, validate_postal

D0 = 0
percent_limits = [MinValueValidator(0), MaxValueValidator(100)]

class AuditStamp(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        abstract = True

class Category(AuditStamp):
    slug = models.SlugField(max_length=80, unique=True)
    title = models.CharField(max_length=80)
    sort_order = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)
    class Meta:
        ordering = ['sort_order','id']
    def __str__(self):
        return self.title

class Product(AuditStamp):
    class Style(models.TextChoices):
        MINIMAL = 'minimal','مینیمال'
        CLASSIC = 'classic','کلاسیک'
        STATEMENT = 'statement','چشمگیر'
    slug = models.SlugField(unique=True, max_length=80)
    name = models.CharField(max_length=180)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name='products')
    style = models.CharField(max_length=20, choices=Style.choices)
    description = models.TextField(blank=True)
    weight_grams = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True, validators=[MinValueValidator(0.0001)])
    karat = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MinValueValidator(1),MaxValueValidator(24)])
    workmanship_percent = models.DecimalField(max_digits=6,decimal_places=3,null=True,blank=True,validators=percent_limits)
    workmanship_fixed_toman = models.DecimalField(max_digits=17,decimal_places=0,default=0,validators=[MinValueValidator(0)],help_text='اجرت ثابت به تومان؛ علاوه بر اجرت درصدی')
    profit_percent = models.DecimalField(max_digits=6,decimal_places=3,null=True,blank=True,validators=percent_limits)
    published = models.BooleanField(default=False)
    class Meta:
        ordering = ['-created_at', '-id']
    def __str__(self):
        return self.name

class ProductImage(models.Model):
    product = models.ForeignKey(Product, related_name='photos', on_delete=models.CASCADE)
    url = models.URLField(max_length=800, validators=[https_url])
    alt = models.CharField(max_length=250)
    sort_order = models.PositiveIntegerField(default=0)
    class Meta:
        ordering = ['sort_order','id']

class Inventory(AuditStamp):
    product = models.OneToOneField(Product, related_name='inventory', on_delete=models.PROTECT)
    on_hand = models.PositiveIntegerField(default=0)
    reserved = models.PositiveIntegerField(default=0)
    class Meta:
        constraints = [models.CheckConstraint(condition=Q(on_hand__gte=F('reserved')), name='stock_gte_reserved')]
    @property
    def available(self):
        return self.on_hand-self.reserved
    def clean(self):
        if self.on_hand < self.reserved:
            raise ValidationError('موجودی نمی‌تواند کمتر از رزروهای فعال باشد.')

class GoldRate(AuditStamp):
    """An approved, explicitly per-karat rate; retain snapshot for old quotes."""
    karat = models.PositiveSmallIntegerField(validators=[MinValueValidator(1),MaxValueValidator(24)])
    toman_per_gram = models.DecimalField(max_digits=19, decimal_places=2, validators=[MinValueValidator(0.01)])
    source_note = models.CharField(max_length=250)
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    verified_at = models.DateTimeField(null=True, blank=True)
    source_observed_at = models.DateTimeField(null=True,blank=True,help_text='زمان اعلام نرخ از طرف منبع')
    valid_until = models.DateTimeField(null=True, blank=True)
    active = models.BooleanField(default=False)
    class Meta:
        ordering = ['-verified_at','-id']
        constraints = [models.UniqueConstraint(fields=['karat'],condition=Q(active=True),name='one_active_rate_per_karat')]
    def clean(self):
        if self.active and (self.valid_until is None or self.valid_until <= timezone.now()):
            raise ValidationError('نرخ فعال باید زمان اعتبار مشخص و آینده داشته باشد.')
    def __str__(self):
        return f'{self.karat} عیار — {self.toman_per_gram} تومان/گرم'

class RateSyncState(models.Model):
    """Singleton, locked with select_for_update so quotes cannot race a rate update."""
    id = models.PositiveSmallIntegerField(primary_key=True,default=1,editable=False)
    blocked = models.BooleanField(default=True)
    last_attempt_at = models.DateTimeField(null=True,blank=True)
    last_success_at = models.DateTimeField(null=True,blank=True)
    last_source_at = models.DateTimeField(null=True,blank=True)
    last_error = models.CharField(max_length=400,blank=True)
    provider_name = models.CharField(max_length=80,default='licensed_feed')
    paused_until = models.DateTimeField(null=True, blank=True, help_text='مکث خودکار پس از پایان سهمیه سرویکس')
    pause_reason = models.CharField(max_length=64, blank=True)
    def __str__(self):
        return 'وضعیت دریافت نرخ طلا'

class RateSyncAttempt(models.Model):
    class Status(models.TextChoices):
        ACCEPTED = 'accepted','پذیرفته شد'
        UNCHANGED = 'unchanged','بدون تغییر'
        REJECTED = 'rejected','مردود / مشکوک'
        FAILED = 'failed','عدم دریافت'
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=16,choices=Status.choices)
    provider_name = models.CharField(max_length=80)
    source_observed_at = models.DateTimeField(null=True,blank=True)
    candidate_toman = models.DecimalField(max_digits=19,decimal_places=2,null=True,blank=True)
    details = models.CharField(max_length=400,blank=True)
    class Meta:
        ordering = ['-created_at','-id']
    def __str__(self):
        return f'{self.get_status_display()} – {self.created_at}'

class PricingPolicy(AuditStamp):
    """Legal/accounting approval is manual; no default tax assumption."""
    tax_percent = models.DecimalField(max_digits=6, decimal_places=3, null=True, blank=True,validators=percent_limits)
    # Only an explicit, reviewed policy can use the following bases.
    tax_basis = models.CharField(max_length=20, choices=[('fee_profit','اجرت و سود'),('none','بدون مالیات')], blank=True)
    shipping_toman = models.DecimalField(max_digits=15,decimal_places=0,null=True,blank=True,validators=[MinValueValidator(0)])
    notes_internal = models.TextField(blank=True)
    approved = models.BooleanField(default=False)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    class Meta:
        verbose_name = 'سیاست محاسبه قیمت'
    def clean(self):
        if self.approved and (self.tax_percent is None or not self.tax_basis or self.shipping_toman is None):
            raise ValidationError('برای تأیید سیاست، نرخ مالیات، مبنا و هزینه ارسال باید تکمیل شوند.')
    def __str__(self):
        return 'سیاست قیمت‌گذاری فعال' if self.approved else 'سیاست قیمت‌گذاری تأییدنشده'

class OtpChallenge(models.Model):
    mobile = models.CharField(max_length=11,db_index=True)
    ip_hash = models.CharField(max_length=64,db_index=True)
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed_at = models.DateTimeField(null=True,blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering=['-created_at']

class Address(AuditStamp):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='shipping_addresses')
    receiver_name = models.CharField(max_length=120)
    receiver_mobile = models.CharField(max_length=11)
    province = models.CharField(max_length=80)
    city = models.CharField(max_length=80)
    address_line = models.CharField(max_length=500)
    postal_code = models.CharField(max_length=10)
    default = models.BooleanField(default=False)
    def clean(self):
        self.receiver_mobile = normalize_mobile(self.receiver_mobile)
        self.postal_code = validate_postal(self.postal_code)

class Favorite(AuditStamp):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,related_name='favorites')
    product = models.ForeignKey(Product,on_delete=models.CASCADE)
    class Meta:
        constraints=[models.UniqueConstraint(fields=['user','product'],name='one_favorite_per_user_product')]

class PriceQuote(models.Model):
    class State(models.TextChoices):
        ACTIVE='active','فعال'
        USED='used','مصرف‌شده'
        EXPIRED='expired','منقضی'
    id = models.UUIDField(primary_key=True,default=uuid.uuid4,editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,related_name='quotes')
    policy = models.ForeignKey(PricingPolicy,on_delete=models.PROTECT)
    subtotal_toman = models.DecimalField(max_digits=20,decimal_places=0)
    tax_toman = models.DecimalField(max_digits=20,decimal_places=0)
    shipping_toman = models.DecimalField(max_digits=20,decimal_places=0)
    total_toman = models.DecimalField(max_digits=20,decimal_places=0)
    expires_at = models.DateTimeField()
    status = models.CharField(max_length=12,choices=State.choices,default=State.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)

class QuoteLine(models.Model):
    quote = models.ForeignKey(PriceQuote,on_delete=models.CASCADE,related_name='lines')
    product = models.ForeignKey(Product,on_delete=models.PROTECT)
    rate = models.ForeignKey(GoldRate,on_delete=models.PROTECT)
    quantity = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    unit_raw_toman = models.DecimalField(max_digits=20,decimal_places=0)
    unit_labor_toman = models.DecimalField(max_digits=20,decimal_places=0)
    unit_profit_toman = models.DecimalField(max_digits=20,decimal_places=0)
    unit_tax_toman = models.DecimalField(max_digits=20,decimal_places=0)
    unit_total_toman = models.DecimalField(max_digits=20,decimal_places=0)
    product_name_snapshot = models.CharField(max_length=180)
    weight_snapshot = models.DecimalField(max_digits=12,decimal_places=4)
    karat_snapshot = models.PositiveSmallIntegerField()

class Order(models.Model):
    class State(models.TextChoices):
        PENDING='pending_payment','منتظر پرداخت'
        PAID='paid','پرداخت شده'
        CANCELLED='cancelled','لغو شده'
        EXPIRED='expired','منقضی'
        SHIPPED='shipped','ارسال شده'
        DELIVERED='delivered','تحویل شده'
    id = models.UUIDField(primary_key=True, default=uuid.uuid4,editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,related_name='orders')
    quote = models.OneToOneField(PriceQuote,on_delete=models.PROTECT)
    idempotency_key = models.CharField(max_length=80)
    status = models.CharField(max_length=24,choices=State.choices,default=State.PENDING)
    shipping_snapshot = models.JSONField(default=dict)
    total_toman = models.DecimalField(max_digits=20,decimal_places=0)
    reservation_expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        constraints=[models.UniqueConstraint(fields=['user','idempotency_key'],name='unique_order_idempotency_per_user')]

class OrderLine(models.Model):
    order = models.ForeignKey(Order,on_delete=models.CASCADE,related_name='lines')
    product = models.ForeignKey(Product,on_delete=models.PROTECT)
    quantity = models.PositiveSmallIntegerField()
    product_name_snapshot = models.CharField(max_length=180)
    unit_total_toman = models.DecimalField(max_digits=20,decimal_places=0)
    weight_snapshot = models.DecimalField(max_digits=12,decimal_places=4)
    karat_snapshot = models.PositiveSmallIntegerField()

class PaymentAttempt(models.Model):
    """Ledger only. No payment is credited without verified provider integration."""
    order = models.ForeignKey(Order,on_delete=models.PROTECT,related_name='payment_attempts')
    provider = models.CharField(max_length=60)
    provider_reference = models.CharField(max_length=140,blank=True)
    status = models.CharField(max_length=20,choices=[('initiated','شروع'),('verified','تأیید'),('failed','ناموفق')],default='initiated')
    amount_toman = models.DecimalField(max_digits=20,decimal_places=0)
    provider_payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    verified_at = models.DateTimeField(null=True,blank=True)
    class Meta:
        constraints=[models.UniqueConstraint(fields=['provider','provider_reference'],condition=~Q(provider_reference=''),name='unique_payment_reference')]

class SupportMessage(models.Model):
    name=models.CharField(max_length=120)
    mobile=models.CharField(max_length=11)
    topic=models.CharField(max_length=120)
    message=models.TextField(max_length=3000)
    created_at=models.DateTimeField(auto_now_add=True)
    handled=models.BooleanField(default=False)

class StoreContent(AuditStamp):
    key=models.SlugField(unique=True,max_length=80)
    title=models.CharField(max_length=160)
    content=models.TextField()
    verified=models.BooleanField(default=False)
    verified_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.SET_NULL,null=True,blank=True)
    def __str__(self):
        return self.title
