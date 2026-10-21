from django.core.management.base import BaseCommand,CommandError
from commerce.rate_service import sync_gold_rate

class Command(BaseCommand):
    help='Fetch licensed rate for 18k gold, validate and publish atomically.'
    def handle(self,*args,**kwargs):
        result=sync_gold_rate()
        self.stdout.write(str(result))
        if result['status'] not in ('accepted','unchanged'):
            raise CommandError('Rate update not accepted; pricing keeps fail-closed protections.')
