from django.core.management.base import BaseCommand
from django.utils import timezone
from commerce.models import Order
from commerce.services import expire_unpaid_order

class Command(BaseCommand):
    help='Release inventory reserved by payment-pending orders whose hold has expired.'
    def handle(self,*args,**options):
        ids=list(Order.objects.filter(status=Order.State.PENDING,reservation_expires_at__lte=timezone.now()).values_list('pk',flat=True)[:500])
        done=0
        for pk in ids:
            if expire_unpaid_order(pk):done+=1
        self.stdout.write(f'Expired reservations released: {done}')
