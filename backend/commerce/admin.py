from django.contrib import admin,messages
from . import models as m

class PhotoInline(admin.TabularInline):
    model=m.ProductImage
    extra=0
    fields=['image','url','alt','sort_order']
    verbose_name='تصویر محصول'
    verbose_name_plural='تصاویر محصول (آپلود فایل یا لینک HTTPS)'

@admin.register(m.Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display=['title','slug','active','sort_order']
    list_editable=['active','sort_order']
    # Slugs are intentionally ASCII IDs; manually enter a stable URL-safe slug.

@admin.register(m.Product)
class ProductAdmin(admin.ModelAdmin):
    list_display=['name','slug','category','style','published','weight_grams','karat','workmanship_percent','workmanship_fixed_toman','profit_percent']
    list_filter=['published','category','style']
    search_fields=['name','slug']
    inlines=[PhotoInline]
    fieldsets=[('مشخصات محصول',{'fields':['slug','name','category','style','description','published']}),
               ('محاسبه خودکار — بدون قیمت دستی',{'fields':['weight_grams','karat','workmanship_percent','workmanship_fixed_toman','profit_percent']})]

@admin.register(m.Inventory)
class InventoryAdmin(admin.ModelAdmin):
    list_display=['product','on_hand','reserved','available_count']
    readonly_fields=['reserved']
    def available_count(self,obj):return obj.available
    def save_model(self,request,obj,form,change):
        obj.full_clean()
        super().save_model(request,obj,form,change)

@admin.register(m.GoldRate)
class RateAdmin(admin.ModelAdmin):
    list_display=['karat','toman_per_gram','source_observed_at','verified_at','valid_until','active','source_note']
    list_filter=['active','karat']
    readonly_fields=['karat','toman_per_gram','source_note','source_observed_at','verified_at',
                     'valid_until','verified_by','active','created_at','updated_at']
    def has_add_permission(self,request):return False
    def has_change_permission(self,request,obj=None):return False
    def has_delete_permission(self,request,obj=None):return False

@admin.register(m.RateSyncState)
class RateSyncStateAdmin(admin.ModelAdmin):
    list_display=['id','blocked','provider_name','last_attempt_at','last_success_at','last_source_at','last_error','paused_until','pause_reason']
    readonly_fields=['id','blocked','provider_name','last_attempt_at','last_success_at','last_source_at','last_error','paused_until','pause_reason']
    def has_add_permission(self,request):return False
    def has_change_permission(self,request,obj=None):return False
    def has_delete_permission(self,request,obj=None):return False

@admin.register(m.RateSyncAttempt)
class RateAttemptAdmin(admin.ModelAdmin):
    list_display=['created_at','provider_name','status','candidate_toman','source_observed_at','details']
    list_filter=['provider_name','status']
    actions=['approve_selected_candidate']
    @admin.action(description='پذیرش نرخ مردود، پس از بررسی مستقل (مدیر ارشد)')
    def approve_selected_candidate(self,request,queryset):
        if not request.user.is_superuser:
            self.message_user(request,'این عملیات فقط برای مدیر ارشد مجاز است.',level=messages.ERROR)
            return
        if queryset.count()!=1:
            self.message_user(request,'فقط یک نرخ را انتخاب کنید.',level=messages.ERROR)
            return
        from .rate_service import approve_reviewed_candidate
        try:
            approve_reviewed_candidate(queryset.first().pk,request.user)
        except (ValueError,PermissionError) as exc:
            self.message_user(request,str(exc),level=messages.ERROR)
        else:
            self.message_user(request,'نرخ پس از تأیید مدیر، فعال شد.',level=messages.SUCCESS)
    readonly_fields=['created_at','provider_name','status','candidate_toman','source_observed_at','details']
    def has_add_permission(self,request):return False
    def has_change_permission(self,request,obj=None):return False
    def has_delete_permission(self,request,obj=None):return False

@admin.register(m.PricingPolicy)
class PricingAdmin(admin.ModelAdmin):
    list_display=['id','approved','tax_percent','tax_basis','shipping_toman','approved_at']
    readonly_fields=['approved_at','approved_by']
    def save_model(self,request,obj,form,change):
        obj.full_clean()
        if obj.approved:
            from django.utils import timezone
            obj.approved_at=timezone.now()
            obj.approved_by=request.user
        else:
            obj.approved_at=None
            obj.approved_by=None
        super().save_model(request,obj,form,change)

@admin.register(m.Order)
class OrderAdmin(admin.ModelAdmin):
    list_display=['id','user','status','total_toman','created_at']
    list_filter=['status']
    readonly_fields=['user','quote','idempotency_key','shipping_snapshot','total_toman','reservation_expires_at','created_at','updated_at']
    def has_add_permission(self,request):return False
    # Staff must not manually mark an order paid: only gateway verification service may.
    def get_readonly_fields(self,request,obj=None):return [f.name for f in self.model._meta.fields]

@admin.register(m.SupportMessage)
class SupportAdmin(admin.ModelAdmin):
    list_display=['name','mobile','topic','created_at','handled']
    list_filter=['handled']

@admin.register(m.StoreContent)
class ContentAdmin(admin.ModelAdmin):
    list_display=['key','title','verified']
    list_filter=['verified']

for model in [m.OtpChallenge,m.Address,m.Favorite,m.PriceQuote,m.QuoteLine,m.OrderLine,m.PaymentAttempt]:
    admin.site.register(model)
