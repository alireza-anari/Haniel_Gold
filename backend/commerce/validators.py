import re
from django.core.exceptions import ValidationError
from django.core.validators import URLValidator

_DIGITS = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')

def normal_digits(value):
    return str(value or '').translate(_DIGITS)

def normalize_mobile(value):
    mobile = normal_digits(value).strip()
    if not re.fullmatch(r'09\d{9}', mobile):
        raise ValidationError('شماره موبایل باید ۱۱ رقم و با 09 آغاز شود.')
    return mobile

def validate_postal(value):
    postal = normal_digits(value).strip()
    if not re.fullmatch(r'\d{10}', postal):
        raise ValidationError('کد پستی باید ده رقم باشد.')
    return postal

def https_url(value):
    URLValidator(schemes=['https'])(value)
    if not value.startswith('https://'):
        raise ValidationError('تصاویر فقط باید با HTTPS بارگذاری شوند.')
