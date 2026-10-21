from rest_framework import serializers
from .models import Address,Product,Order,PriceQuote
from .validators import normalize_mobile,validate_postal,normal_digits

class OtpRequestSerializer(serializers.Serializer):
    mobile=serializers.CharField(max_length=16)
    def validate_mobile(self,v):return normalize_mobile(v)

class OtpVerifySerializer(OtpRequestSerializer):
    code=serializers.CharField(max_length=6,min_length=6)
    def validate_code(self,v):
        v=normal_digits(v)
        if not v.isascii() or not v.isdigit() or len(v)!=6:
            raise serializers.ValidationError('کد تأیید باید شش رقم باشد.')
        return v

class SupportSerializer(serializers.Serializer):
    name=serializers.CharField(max_length=120)
    mobile=serializers.CharField(max_length=16)
    topic=serializers.CharField(max_length=120)
    message=serializers.CharField(max_length=3000,min_length=8)
    def validate_mobile(self,v):return normalize_mobile(v)

class AddressSerializer(serializers.ModelSerializer):
    receiverName=serializers.CharField(source='receiver_name',max_length=120)
    receiverMobile=serializers.CharField(source='receiver_mobile',max_length=16)
    addressLine=serializers.CharField(source='address_line',max_length=500)
    postalCode=serializers.CharField(source='postal_code',max_length=10)
    class Meta:
        model=Address
        fields=['id','receiverName','receiverMobile','province','city','addressLine','postalCode','default']
    def validate_receiverMobile(self,v):return normalize_mobile(v)
    def validate_postalCode(self,v):return validate_postal(v)
    def create(self,validated_data):
        return Address.objects.create(user=self.context['request'].user,**validated_data)

class QuoteItemSerializer(serializers.Serializer):
    productId=serializers.SlugField(max_length=80)
    quantity=serializers.IntegerField(min_value=1,max_value=30)

class QuoteRequestSerializer(serializers.Serializer):
    items=QuoteItemSerializer(many=True,allow_empty=False)

class OrderRequestSerializer(serializers.Serializer):
    quoteId=serializers.UUIDField()
    addressId=serializers.IntegerField(min_value=1)

class FavoriteRequestSerializer(serializers.Serializer):
    productId=serializers.SlugField(max_length=80)


def product_json(product,pricing_context=None,request=None):
    image_items=list(product.photos.all())
    # Uploaded media uses an absolute, HTTPS URL for the separate staging frontend.
    photos=[(request.build_absolute_uri(p.image.url) if request else p.image.url)
            if p.image else p.url for p in image_items]
    inventory=getattr(product,'inventory',None)
    from .rate_service import current_pricing_context
    from .services import calculate_line,ServiceUnavailable
    rate,policy,status=pricing_context if pricing_context is not None else current_pricing_context()
    price={'amountToman':None,'currency':'TOMAN','status':'unavailable','breakdown':None}
    if (status=='ready' and rate is not None and policy is not None and
        inventory is not None and inventory.available>0 and product.karat==rate.karat):
        try:
            parts=calculate_line(product,rate,policy)
            price={'amountToman':int(parts['total']),'currency':'TOMAN','status':'available',
                'breakdown':{'rawToman':int(parts['raw']),'workmanshipToman':int(parts['labor']),
                             'profitToman':int(parts['profit']),'taxToman':int(parts['tax'])},
                'rateObservedAt':rate.source_observed_at.isoformat() if rate.source_observed_at else None,
                'rateValidUntil':rate.valid_until.isoformat()}
        except (ServiceUnavailable,TypeError):
            pass
    return {
        'id':product.slug,'name':product.name,'category':product.category.title,
        'categorySlug':product.category.slug,'style':product.get_style_display(),
        'description':product.description,'images':photos,'alt':image_items[0].alt if image_items else product.name,
        'weightGrams':str(product.weight_grams) if product.weight_grams is not None else None,
        'karat':product.karat,
        'price':price,
        'inventoryStatus':'available' if inventory and inventory.available>0 else 'unavailable',
    }

def quote_json(quote):
    return {'quoteId':str(quote.id),'currency':'TOMAN','expiresAt':quote.expires_at.isoformat(),
            'subtotalToman':int(quote.subtotal_toman),'taxToman':int(quote.tax_toman),
            'shippingToman':int(quote.shipping_toman),'totalToman':int(quote.total_toman),
            'items':[{'productId':l.product.slug,'name':l.product_name_snapshot,'quantity':l.quantity,
                      'weightGrams':str(l.weight_snapshot),'karat':l.karat_snapshot,
                      'unitRawToman':int(l.unit_raw_toman),'unitWorkmanshipToman':int(l.unit_labor_toman),
                      'unitProfitToman':int(l.unit_profit_toman),'unitTaxToman':int(l.unit_tax_toman),
                      'unitTotalToman':int(l.unit_total_toman)} for l in quote.lines.select_related('product')]}

def order_json(order):
    return {'id':str(order.id),'status':order.status,'totalToman':int(order.total_toman),
            'currency':'TOMAN','reservationExpiresAt':order.reservation_expires_at.isoformat(),
            'createdAt':order.created_at.isoformat(),'shippingAddress':order.shipping_snapshot,
            'items':[{'productId':l.product.slug,'name':l.product_name_snapshot,'quantity':l.quantity,
                      'unitTotalToman':int(l.unit_total_toman)} for l in order.lines.select_related('product')]}
