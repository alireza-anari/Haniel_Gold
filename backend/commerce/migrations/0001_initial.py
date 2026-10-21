# Initial schema: generated and curated for HANI-EL GOLD.
import uuid
import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.db.models import Q, F
import commerce.validators


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(name='Category', fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('created_at',models.DateTimeField(auto_now_add=True)),('updated_at',models.DateTimeField(auto_now=True)),
            ('slug',models.SlugField(max_length=80,unique=True)),('title',models.CharField(max_length=80)),
            ('sort_order',models.PositiveIntegerField(default=0)),('active',models.BooleanField(default=True)),
        ],options={'ordering':['sort_order','id']}),
        migrations.CreateModel(name='Product', fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('created_at',models.DateTimeField(auto_now_add=True)),('updated_at',models.DateTimeField(auto_now=True)),
            ('slug',models.SlugField(max_length=80,unique=True)),('name',models.CharField(max_length=180)),
            ('style',models.CharField(choices=[('minimal','مینیمال'),('classic','کلاسیک'),('statement','چشمگیر')],max_length=20)),
            ('description',models.TextField(blank=True)),
            ('weight_grams',models.DecimalField(blank=True,decimal_places=4,max_digits=12,null=True,validators=[django.core.validators.MinValueValidator(0.0001)])),
            ('karat',models.PositiveSmallIntegerField(blank=True,null=True,validators=[django.core.validators.MinValueValidator(1),django.core.validators.MaxValueValidator(24)])),
            ('workmanship_percent',models.DecimalField(blank=True,decimal_places=3,max_digits=6,null=True,validators=[django.core.validators.MinValueValidator(0),django.core.validators.MaxValueValidator(100)])),
            ('profit_percent',models.DecimalField(blank=True,decimal_places=3,max_digits=6,null=True,validators=[django.core.validators.MinValueValidator(0),django.core.validators.MaxValueValidator(100)])),
            ('published',models.BooleanField(default=False)),
            ('category',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='products',to='commerce.category')),
        ],options={'ordering':['-created_at','-id']}),
        migrations.CreateModel(name='ProductImage',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('url',models.URLField(max_length=800,validators=[commerce.validators.https_url])),
            ('alt',models.CharField(max_length=250)),('sort_order',models.PositiveIntegerField(default=0)),
            ('product',models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name='photos',to='commerce.product')),
        ],options={'ordering':['sort_order','id']}),
        migrations.CreateModel(name='Inventory',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('created_at',models.DateTimeField(auto_now_add=True)),('updated_at',models.DateTimeField(auto_now=True)),
            ('on_hand',models.PositiveIntegerField(default=0)),('reserved',models.PositiveIntegerField(default=0)),
            ('product',models.OneToOneField(on_delete=django.db.models.deletion.PROTECT,related_name='inventory',to='commerce.product')),
        ]),
        migrations.CreateModel(name='GoldRate',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('created_at',models.DateTimeField(auto_now_add=True)),('updated_at',models.DateTimeField(auto_now=True)),
            ('karat',models.PositiveSmallIntegerField(validators=[django.core.validators.MinValueValidator(1),django.core.validators.MaxValueValidator(24)])),
            ('toman_per_gram',models.DecimalField(decimal_places=2,max_digits=19,validators=[django.core.validators.MinValueValidator(0.01)])),
            ('source_note',models.CharField(max_length=250)),('verified_at',models.DateTimeField(blank=True,null=True)),('valid_until',models.DateTimeField(blank=True,null=True)),('active',models.BooleanField(default=False)),
            ('verified_by',models.ForeignKey(null=True,on_delete=django.db.models.deletion.SET_NULL,to=settings.AUTH_USER_MODEL)),
        ],options={'ordering':['-verified_at','-id']}),
        migrations.CreateModel(name='PricingPolicy',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('created_at',models.DateTimeField(auto_now_add=True)),('updated_at',models.DateTimeField(auto_now=True)),
            ('tax_percent',models.DecimalField(blank=True,decimal_places=3,max_digits=6,null=True,validators=[django.core.validators.MinValueValidator(0),django.core.validators.MaxValueValidator(100)])),
            ('tax_basis',models.CharField(blank=True,choices=[('fee_profit','اجرت و سود'),('none','بدون مالیات')],max_length=20)),
            ('shipping_toman',models.DecimalField(blank=True,decimal_places=0,max_digits=15,null=True,validators=[django.core.validators.MinValueValidator(0)])),
            ('notes_internal',models.TextField(blank=True)),('approved',models.BooleanField(default=False)),
            ('approved_at',models.DateTimeField(blank=True,null=True)),
            ('approved_by',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.SET_NULL,to=settings.AUTH_USER_MODEL)),
        ],options={'verbose_name':'سیاست محاسبه قیمت'}),
        migrations.CreateModel(name='OtpChallenge',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('mobile',models.CharField(db_index=True,max_length=11)),('ip_hash',models.CharField(db_index=True,max_length=64)),
            ('code_hash',models.CharField(max_length=128)),('expires_at',models.DateTimeField()),
            ('attempts',models.PositiveSmallIntegerField(default=0)),('consumed_at',models.DateTimeField(blank=True,null=True)),
            ('created_at',models.DateTimeField(auto_now_add=True)),
        ],options={'ordering':['-created_at']}),
        migrations.CreateModel(name='Address',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('created_at',models.DateTimeField(auto_now_add=True)),('updated_at',models.DateTimeField(auto_now=True)),
            ('receiver_name',models.CharField(max_length=120)),('receiver_mobile',models.CharField(max_length=11)),
            ('province',models.CharField(max_length=80)),('city',models.CharField(max_length=80)),
            ('address_line',models.CharField(max_length=500)),('postal_code',models.CharField(max_length=10)),
            ('default',models.BooleanField(default=False)),
            ('user',models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name='shipping_addresses',to=settings.AUTH_USER_MODEL)),
        ]),
        migrations.CreateModel(name='Favorite',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('created_at',models.DateTimeField(auto_now_add=True)),('updated_at',models.DateTimeField(auto_now=True)),
            ('product',models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,to='commerce.product')),
            ('user',models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name='favorites',to=settings.AUTH_USER_MODEL)),
        ]),
        migrations.CreateModel(name='PriceQuote',fields=[
            ('id',models.UUIDField(default=uuid.uuid4,editable=False,primary_key=True,serialize=False)),
            ('subtotal_toman',models.DecimalField(decimal_places=0,max_digits=20)),('tax_toman',models.DecimalField(decimal_places=0,max_digits=20)),
            ('shipping_toman',models.DecimalField(decimal_places=0,max_digits=20)),('total_toman',models.DecimalField(decimal_places=0,max_digits=20)),
            ('expires_at',models.DateTimeField()),('status',models.CharField(choices=[('active','فعال'),('used','مصرف‌شده'),('expired','منقضی')],default='active',max_length=12)),
            ('created_at',models.DateTimeField(auto_now_add=True)),
            ('policy',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,to='commerce.pricingpolicy')),
            ('user',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='quotes',to=settings.AUTH_USER_MODEL)),
        ]),
        migrations.CreateModel(name='QuoteLine',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('quantity',models.PositiveSmallIntegerField(validators=[django.core.validators.MinValueValidator(1)])),
            ('unit_raw_toman',models.DecimalField(decimal_places=0,max_digits=20)),
            ('unit_labor_toman',models.DecimalField(decimal_places=0,max_digits=20)),
            ('unit_profit_toman',models.DecimalField(decimal_places=0,max_digits=20)),
            ('unit_tax_toman',models.DecimalField(decimal_places=0,max_digits=20)),
            ('unit_total_toman',models.DecimalField(decimal_places=0,max_digits=20)),
            ('product_name_snapshot',models.CharField(max_length=180)),
            ('weight_snapshot',models.DecimalField(decimal_places=4,max_digits=12)),
            ('karat_snapshot',models.PositiveSmallIntegerField()),
            ('product',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,to='commerce.product')),
            ('quote',models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name='lines',to='commerce.pricequote')),
            ('rate',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,to='commerce.goldrate')),
        ]),
        migrations.CreateModel(name='Order',fields=[
            ('id',models.UUIDField(default=uuid.uuid4,editable=False,primary_key=True,serialize=False)),
            ('idempotency_key',models.CharField(max_length=80)),
            ('status',models.CharField(choices=[('pending_payment','منتظر پرداخت'),('paid','پرداخت شده'),('cancelled','لغو شده'),('expired','منقضی'),('shipped','ارسال شده'),('delivered','تحویل شده')],default='pending_payment',max_length=24)),
            ('shipping_snapshot',models.JSONField(default=dict)),('total_toman',models.DecimalField(decimal_places=0,max_digits=20)),
            ('reservation_expires_at',models.DateTimeField()),('created_at',models.DateTimeField(auto_now_add=True)),
            ('updated_at',models.DateTimeField(auto_now=True)),
            ('quote',models.OneToOneField(on_delete=django.db.models.deletion.PROTECT,to='commerce.pricequote')),
            ('user',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='orders',to=settings.AUTH_USER_MODEL)),
        ]),
        migrations.CreateModel(name='OrderLine',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('quantity',models.PositiveSmallIntegerField()),('product_name_snapshot',models.CharField(max_length=180)),
            ('unit_total_toman',models.DecimalField(decimal_places=0,max_digits=20)),
            ('weight_snapshot',models.DecimalField(decimal_places=4,max_digits=12)),('karat_snapshot',models.PositiveSmallIntegerField()),
            ('order',models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name='lines',to='commerce.order')),
            ('product',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,to='commerce.product')),
        ]),
        migrations.CreateModel(name='PaymentAttempt',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('provider',models.CharField(max_length=60)),('provider_reference',models.CharField(blank=True,max_length=140)),
            ('status',models.CharField(choices=[('initiated','شروع'),('verified','تأیید'),('failed','ناموفق')],default='initiated',max_length=20)),
            ('amount_toman',models.DecimalField(decimal_places=0,max_digits=20)),('provider_payload',models.JSONField(default=dict)),
            ('created_at',models.DateTimeField(auto_now_add=True)),('verified_at',models.DateTimeField(blank=True,null=True)),
            ('order',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='payment_attempts',to='commerce.order')),
        ]),
        migrations.CreateModel(name='SupportMessage',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('name',models.CharField(max_length=120)),('mobile',models.CharField(max_length=11)),
            ('topic',models.CharField(max_length=120)),('message',models.TextField(max_length=3000)),
            ('created_at',models.DateTimeField(auto_now_add=True)),('handled',models.BooleanField(default=False)),
        ]),
        migrations.CreateModel(name='StoreContent',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('created_at',models.DateTimeField(auto_now_add=True)),('updated_at',models.DateTimeField(auto_now=True)),
            ('key',models.SlugField(max_length=80,unique=True)),('title',models.CharField(max_length=160)),
            ('content',models.TextField()),('verified',models.BooleanField(default=False)),
            ('verified_by',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.SET_NULL,to=settings.AUTH_USER_MODEL)),
        ]),
        migrations.AddConstraint(model_name='inventory',constraint=models.CheckConstraint(condition=Q(on_hand__gte=F('reserved')),name='stock_gte_reserved')),
        migrations.AddConstraint(model_name='goldrate',constraint=models.UniqueConstraint(fields=('karat',),condition=Q(active=True),name='one_active_rate_per_karat')),
        migrations.AddConstraint(model_name='favorite',constraint=models.UniqueConstraint(fields=('user','product'),name='one_favorite_per_user_product')),
        migrations.AddConstraint(model_name='order',constraint=models.UniqueConstraint(fields=('user','idempotency_key'),name='unique_order_idempotency_per_user')),
        migrations.AddConstraint(model_name='paymentattempt',constraint=models.UniqueConstraint(fields=('provider','provider_reference'),condition=~Q(provider_reference=''),name='unique_payment_reference')),
    ]
