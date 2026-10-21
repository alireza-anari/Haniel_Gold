"""One-request Servix diagnostic without Django database changes."""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from commerce.servix import fetch_servix_rate, ServixAPIError


class Command(BaseCommand):
    help = 'Verify the official Servix 18K gold API once (uses 1 request; no DB changes).'

    def handle(self, *args, **kwargs):
        try:
            observation = fetch_servix_rate(
                api_key=settings.SERVIX_API_KEY,
                max_age_seconds=settings.GOLD_FEED_MAX_SOURCE_AGE_SECONDS,
            )
        except ServixAPIError as exc:
            raise CommandError(f'{exc.code}: {exc}') from exc
        self.stdout.write(self.style.SUCCESS('Servix API connected and response validated.'))
        self.stdout.write(f'Gold 18K: {observation.toman_per_gram} TOMAN/gram')
        self.stdout.write(f'Source time: {observation.observed_at.isoformat()}')
        self.stdout.write('Note: Rate is NOT activated in PostgreSQL by this diagnostic.')
