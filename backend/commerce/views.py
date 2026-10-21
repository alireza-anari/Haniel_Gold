"""Versioned JSON endpoints for the HANI-EL GOLD V5 frontend."""
from django.contrib.auth import logout
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect,ensure_csrf_cookie
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions,status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import (Category,Product,Address,Favorite,SupportMessage,PriceQuote,
                     Order,StoreContent)
from .serializers import (AddressSerializer,OtpRequestSerializer,OtpVerifySerializer,
    SupportSerializer,QuoteRequestSerializer,OrderRequestSerializer,FavoriteRequestSerializer,
    product_json,quote_json,order_json)
from .services import create_quote,place_order,issue_otp,verify_otp,ServiceUnavailable
from .rate_service import current_pricing_context,market_status

@ensure_csrf_cookie
def csrf_token(request):
    return JsonResponse({'csrfToken':get_token(request)})

class CsrfAPIView(APIView):
    """Apply CSRF to ALL POST/PATCH/DELETE calls, including anonymous OTP/support."""
    @method_decorator(csrf_protect)
    def dispatch(self,*args,**kwargs):
        return super().dispatch(*args,**kwargs)

class PublicAPIView(CsrfAPIView):
    permission_classes=[permissions.AllowAny]

class Health(PublicAPIView):
    def get(self,request):
        return Response({'status':'ok','service':'haniel-api','version':'v1'})

class Ready(PublicAPIView):
    """Readiness, not a guarantee that gold sale integrations are activated."""
    def get(self,request):
        from django.db import connection
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT 1')
                cursor.fetchone()
        except Exception:
            return Response({'status':'not_ready'},status=503)
        return Response({'status':'ready','database':'available'})

class Categories(PublicAPIView):
    def get(self,request):
        return Response({'items':[{'slug':x.slug,'title':x.title} for x in Category.objects.filter(active=True)]})

class Products(PublicAPIView):
    def get(self,request):
        try:limit=int(request.query_params.get('limit','24'))
        except ValueError:raise ValidationError({'limit':'عدد معتبر لازم است.'})
        if limit<1 or limit>100:raise ValidationError({'limit':'بازه مجاز از ۱ تا ۱۰۰ است.'})
        qs=Product.objects.filter(published=True,category__active=True,photos__isnull=False).distinct().select_related('category','inventory').prefetch_related('photos')
        category=request.query_params.get('category')
        if category:qs=qs.filter(category__slug=category)
        style=request.query_params.get('style')
        if style:
            style_codes={label:code for code,label in Product.Style.choices}
            qs=qs.filter(style=style_codes.get(style,style))
        query=request.query_params.get('q','').strip()
        if query:qs=qs.filter(name__icontains=query[:100])
        total=qs.count()
        offset_str=request.query_params.get('offset','0')
        try:offset=int(offset_str)
        except ValueError:raise ValidationError({'offset':'عدد معتبر لازم است.'})
        if offset<0 or offset>100000:raise ValidationError({'offset':'خارج از محدوده است.'})
        context=current_pricing_context()
        items=[product_json(p,pricing_context=context) for p in qs[offset:offset+limit]]
        return Response({'items':items,'total':total,'limit':limit,'offset':offset,'nextOffset':offset+limit if offset+limit<total else None})

class ProductDetail(PublicAPIView):
    def get(self,request,slug):
        p=get_object_or_404(Product.objects.filter(published=True,category__active=True,photos__isnull=False).distinct().select_related('category','inventory').prefetch_related('photos'),slug=slug)
        return Response(product_json(p,pricing_context=current_pricing_context()))

class PublicGoldRate(PublicAPIView):
    def get(self,request):
        response=Response(market_status())
        response['Cache-Control']='no-store'
        return response

class OtpRequest(PublicAPIView):
    throttle_classes=[ScopedRateThrottle]
    throttle_scope='otp'
    def post(self,request):
        ser=OtpRequestSerializer(data=request.data);ser.is_valid(raise_exception=True)
        # Proxy IP resolution is intentionally conservative. Only use REMOTE_ADDR behind a trusted reverse proxy.
        issue_otp(ser.validated_data['mobile'],request.META.get('REMOTE_ADDR',''))
        return Response({'status':'code_requested'},status=202)

class OtpVerify(PublicAPIView):
    throttle_classes=[ScopedRateThrottle]
    throttle_scope='otp'
    def post(self,request):
        ser=OtpVerifySerializer(data=request.data);ser.is_valid(raise_exception=True)
        user=verify_otp(request,ser.validated_data['mobile'],ser.validated_data['code'])
        return Response({'authenticated':True,'csrfToken':get_token(request),
            'account':{'id':user.pk,'mobile':user.username}})

class Account(CsrfAPIView):
    def get(self,request):
        return Response({'id':request.user.pk,'mobile':request.user.username,'authenticated':True})

class Logout(CsrfAPIView):
    def post(self,request):
        logout(request)
        return Response({'authenticated':False,'csrfToken':get_token(request)})

class AddressList(CsrfAPIView):
    def get(self,request):
        qs=Address.objects.filter(user=request.user).order_by('-default','-id')
        return Response({'items':AddressSerializer(qs,many=True).data})
    def post(self,request):
        ser=AddressSerializer(data=request.data,context={'request':request});ser.is_valid(raise_exception=True)
        with transaction.atomic():
            if ser.validated_data.get('default'):
                Address.objects.filter(user=request.user).update(default=False)
            addr=ser.save()
        return Response(AddressSerializer(addr).data,status=201)

class AddressDetail(CsrfAPIView):
    def patch(self,request,pk):
        addr=get_object_or_404(Address,id=pk,user=request.user)
        ser=AddressSerializer(addr,data=request.data,partial=True,context={'request':request});ser.is_valid(raise_exception=True)
        with transaction.atomic():
            if ser.validated_data.get('default'):
                Address.objects.filter(user=request.user).exclude(id=addr.id).update(default=False)
            addr=ser.save()
        return Response(AddressSerializer(addr).data)
    def delete(self,request,pk):
        addr=get_object_or_404(Address,id=pk,user=request.user)
        addr.delete()
        return Response(status=204)

class FavoriteList(CsrfAPIView):
    def get(self,request):
        records=Favorite.objects.filter(user=request.user).select_related('product','product__category','product__inventory').prefetch_related('product__photos')
        return Response({'items':[product_json(x.product) for x in records if x.product.published]})
    def post(self,request):
        ser=FavoriteRequestSerializer(data=request.data);ser.is_valid(raise_exception=True)
        p=get_object_or_404(Product,published=True,slug=ser.validated_data['productId'])
        Favorite.objects.get_or_create(user=request.user,product=p)
        return Response({'saved':True,'productId':p.slug},status=201)

class FavoriteDetail(CsrfAPIView):
    def delete(self,request,slug):
        Favorite.objects.filter(user=request.user,product__slug=slug).delete()
        return Response(status=204)

class Support(PublicAPIView):
    throttle_classes=[ScopedRateThrottle]
    throttle_scope='support'
    def post(self,request):
        ser=SupportSerializer(data=request.data);ser.is_valid(raise_exception=True)
        x=SupportMessage.objects.create(**ser.validated_data)
        return Response({'received':True,'reference':x.pk,'status':'stored_for_review'},status=201)

class Quote(CsrfAPIView):
    def post(self,request):
        ser=QuoteRequestSerializer(data=request.data);ser.is_valid(raise_exception=True)
        quote=create_quote(request.user,ser.validated_data['items'])
        return Response(quote_json(quote),status=201)

class Orders(CsrfAPIView):
    def get(self,request):
        qs=Order.objects.filter(user=request.user).prefetch_related('lines__product').order_by('-created_at')[:50]
        return Response({'items':[order_json(o) for o in qs]})
    def post(self,request):
        ser=OrderRequestSerializer(data=request.data);ser.is_valid(raise_exception=True)
        key=request.headers.get('Idempotency-Key','')
        if not 8<=len(key)<=80 or not all(c.isascii() and (c.isalnum() or c in '-_') for c in key):
            raise ValidationError({'Idempotency-Key':'یک کلید یکتای ۸ تا ۸۰ کاراکتری در هدر لازم است.'})
        address=get_object_or_404(Address,pk=ser.validated_data['addressId'],user=request.user)
        order,created=place_order(request.user,ser.validated_data['quoteId'],address,key)
        return Response(order_json(order),status=201 if created else 200)

class OrderDetail(CsrfAPIView):
    def get(self,request,pk):
        order=get_object_or_404(Order.objects.filter(user=request.user).prefetch_related('lines__product'),pk=pk)
        return Response(order_json(order))

class PaymentStart(CsrfAPIView):
    def post(self,request):
        # Do not simulate a successful transaction. Activation requires audited real gateway integration.
        raise ServiceUnavailable('درگاه پرداخت هنوز متصل نشده است؛ هیچ پرداختی آغاز یا ثبت نشده است.')

class PublicContent(PublicAPIView):
    def get(self,request,key):
        item=get_object_or_404(StoreContent,key=key,verified=True)
        return Response({'title':item.title,'content':item.content,'updatedAt':item.updated_at.isoformat()})
