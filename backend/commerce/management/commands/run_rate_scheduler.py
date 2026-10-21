"""One dedicated worker, synchronized to Tehran half-hour marks.

A PostgreSQL session advisory lock stops accidental duplicate workers consuming
2x the daily free Servix quota. This worker never exposes its API secret.
"""
import time
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.utils import timezone

from commerce.rate_service import sync_gold_rate

_LOCK_KEY = 184018018  # project-wide advisory lock for 18K gold feed scheduler


class Command(BaseCommand):
    help = 'Run one 18K Servix rate job at :00 and :30 Tehran time.'

    def handle(self, *args, **kwargs):
        if connection.vendor != 'postgresql':
            raise CommandError('Gold rate production scheduler requires PostgreSQL.')
        with connection.cursor() as cursor:
            cursor.execute('SELECT pg_try_advisory_lock(%s)', [_LOCK_KEY])
            acquired = cursor.fetchone()[0]
        if not acquired:
            raise CommandError('A gold-rate scheduler is already running.')
        zone = ZoneInfo('Asia/Tehran')
        self.stdout.write('Servix scheduler started: :00/:30 Asia/Tehran')
        try:
            while True:
                now = timezone.now().astimezone(zone)
                hour = now.replace(minute=0, second=0, microsecond=0)
                upcoming = hour + timedelta(minutes=30 if now.minute < 30 else 60)
                time.sleep(max((upcoming - now).total_seconds(), 0.1))
                try:
                    result = sync_gold_rate()
                    # Logging only status, never response body or API key.
                    self.stdout.write(str(result))
                except Exception as exc:
                    self.stderr.write('Rate job failed: ' + type(exc).__name__)
                    time.sleep(2)
        finally:
            if connection.connection is not None:
                with connection.cursor() as cursor:
                    cursor.execute('SELECT pg_advisory_unlock(%s)', [_LOCK_KEY])
