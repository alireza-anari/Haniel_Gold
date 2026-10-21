"""Licensed HTTPS JSON rate feed transport and validation. Pure Python, no Django imports.

No TGJU URL/JSON schema is guessed: after licensing set the exact endpoint,
JSON key paths, money unit and signed source timestamp from provider docs.
"""
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
from urllib.parse import urlsplit
import json
import re
import requests

class FeedError(ValueError):
    pass

@dataclass(frozen=True)
class Observation:
    toman_per_gram: Decimal
    observed_at: datetime

_ARABIC_PERSIAN = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')

def to_decimal(value):
    if isinstance(value,bool) or value is None:
        raise FeedError('نرخ خالی یا نامعتبر است.')
    if not isinstance(value,(str,int,Decimal)):
        raise FeedError('نوع مقدار نرخ نامعتبر است.')
    raw=str(value).translate(_ARABIC_PERSIAN).replace(',','').replace('٬','').strip()
    if not re.fullmatch(r'\d+(?:\.\d{1,2})?',raw):
        raise FeedError('مقدار نرخ فقط باید عدد مثبت باشد.')
    try:
        num=Decimal(raw)
    except InvalidOperation as exc:
        raise FeedError('نرخ قابل خواندن نیست.') from exc
    if not num.is_finite() or num<=0:
        raise FeedError('نرخ باید مثبت و متناهی باشد.')
    return num

def at_path(document,path):
    if not path or not isinstance(path,str):
        raise FeedError('مسیر فیلد نرخ یا زمان منبع تنظیم نشده است.')
    item=document
    for component in path.split('.'):
        if isinstance(item,dict):
            if component not in item: raise FeedError('ساختار پاسخ سرویس با قرارداد مورد انتظار همخوان نیست.')
            item=item[component]
        elif isinstance(item,list) and component.isdecimal() and int(component)<len(item):
            item=item[int(component)]
        else:
            raise FeedError('ساختار پاسخ سرویس با قرارداد مورد انتظار همخوان نیست.')
    return item

def parse_observation(data,*,price_path,time_path,unit,now=None,max_age_seconds=2400):
    if unit not in ('TOMAN','RIAL'):
        raise FeedError('واحد رسمی سرویس باید به‌صراحت TOMAN یا RIAL تعیین شود.')
    rate=to_decimal(at_path(data,price_path))
    rate=rate/Decimal('10') if unit=='RIAL' else rate
    if rate.as_tuple().exponent < -2:
        raise FeedError('مقدار نرخ بیش از دو رقم اعشار دارد.')
    rate=rate.quantize(Decimal('.01'))
    raw_time=at_path(data,time_path)
    if not isinstance(raw_time,str):
        raise FeedError('زمان ثبت نرخ باید ISO 8601 دارای منطقه زمانی باشد.')
    try:
        observed=datetime.fromisoformat(raw_time.replace('Z','+00:00'))
    except ValueError as exc:
        raise FeedError('زمان ثبت نرخ ISO 8601 معتبر نیست.') from exc
    if observed.tzinfo is None or observed.utcoffset() is None:
        raise FeedError('زمان نرخ باید منطقه زمانی مشخص داشته باشد.')
    now=now or datetime.now(timezone.utc)
    if observed>now+timedelta(minutes=2):
        raise FeedError('زمان نرخ از آینده است.')
    if now-observed>timedelta(seconds=max_age_seconds):
        raise FeedError('زمان نرخ منقضی یا قدیمی است.')
    return Observation(toman_per_gram=rate,observed_at=observed)

def validate_feed_config(*,url,allowed_host,api_key):
    u=urlsplit(url)
    if u.scheme!='https' or not u.hostname or u.username or u.password or u.fragment:
        raise FeedError('فقط HTTPS با میزبان مشخص و بدون userinfo مجاز است.')
    if not allowed_host or u.hostname.lower()!=allowed_host.strip().lower():
        raise FeedError('میزبان API در فهرست منبع مورد تأیید نیست.')
    if not api_key:
        raise FeedError('کلید دسترسی وب‌سرویس مجاز تنظیم نشده است.')

def fetch_observation(*,url,allowed_host,api_key,auth_header,auth_prefix,
                      price_path,time_path,unit,max_age_seconds=2400,requester=None):
    validate_feed_config(url=url,allowed_host=allowed_host,api_key=api_key)
    if not re.fullmatch(r'[A-Za-z0-9-]{1,80}',auth_header):
        raise FeedError('نام هدر احراز هویت نامعتبر است.')
    requester=requester or requests.get
    try:
        # Follow redirects is explicitly disabled to prevent SSRF to another host.
        res=requester(url,headers={auth_header:auth_prefix+api_key,'Accept':'application/json'},
                      timeout=(5,10),allow_redirects=False)
        if res.status_code!=200:
            raise FeedError('سرویس نرخ پاسخ موفق و معتبر برنگرداند.')
        if len(res.content)>256_000:
            raise FeedError('اندازه پاسخ سرویس نرخ نامعتبر است.')
        data=json.loads(res.content.decode('utf-8'),parse_float=Decimal)
    except (requests.RequestException,UnicodeError,json.JSONDecodeError) as exc:
        raise FeedError('اتصال یا پاسخ JSON سرویس نرخ نامعتبر است.') from exc
    return parse_observation(data,price_path=price_path,time_path=time_path,
                             unit=unit,max_age_seconds=max_age_seconds)
