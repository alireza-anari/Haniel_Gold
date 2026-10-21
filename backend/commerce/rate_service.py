"""Atomic rate acceptance, anomaly guard and public dynamic prices.

The feed is read outside the DB transaction. The rate switch is one atomic unit.
All checkout operations lock the singleton sync state before the quote/rate.
"""
from datetime import timedelta
from decimal import Decimal
import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from .models import GoldRate,RateSyncState,RateSyncAttempt,PricingPolicy
from .rate_feed import fetch_observation,FeedError
from .servix import fetch_servix_rate,ServixQuotaExceeded,ServixAPIError

log=logging.getLogger(__name__)

class SuspiciousRate(FeedError):pass


def current_pricing_context(*,require_policy=True):
    state=RateSyncState.objects.filter(pk=1).first()
    if state is None or state.blocked:
        return None,None,'blocked'
    now=timezone.now()
    rate=GoldRate.objects.filter(karat=18,active=True,verified_at__isnull=False,
                                 valid_until__gt=now).order_by('-id').first()
    if rate is None:
        return None,None,'expired'
    if not require_policy:
        return rate,None,'ready'
    policy=PricingPolicy.objects.filter(approved=True).order_by('-approved_at','-id').first()
    if (policy is None or policy.tax_percent is None or not policy.tax_basis or
        policy.shipping_toman is None):
        return rate,None,'policy_missing'
    return rate,policy,'ready'


def sync_gold_rate(*,observation=None):
    """Only 18k from a licensed API; multi-karat support requires a separate approved feed.

    Every call leaves an audit record. Failures never turn on an unverified rate.
    Critical deviation or older timestamps BLOCK all orders until valid feed review.
    """
    provider=settings.GOLD_FEED_PROVIDER_NAME
    now=timezone.now()
    # Quota exhaustions should not trigger repeated requests to the same provider.
    state_before=RateSyncState.objects.filter(pk=1).first()
    if (observation is None and provider == 'servix' and state_before and state_before.paused_until
            and state_before.paused_until>now):
        return {'status':'paused','message':'Servix quota cooldown active',
                'pausedUntil':state_before.paused_until.isoformat()}
    if observation is None:
        try:
            if provider == 'servix':
                observation=fetch_servix_rate(
                    api_key=settings.SERVIX_API_KEY,
                    max_age_seconds=settings.GOLD_FEED_MAX_SOURCE_AGE_SECONDS,
                )
            else:
                observation=fetch_observation(
                    url=settings.GOLD_FEED_URL,
                    allowed_host=settings.GOLD_FEED_ALLOWED_HOST,
                    api_key=settings.GOLD_FEED_API_KEY,
                    auth_header=settings.GOLD_FEED_AUTH_HEADER,
                    auth_prefix=settings.GOLD_FEED_AUTH_PREFIX,
                    price_path=settings.GOLD_FEED_VALUE_PATH,
                    time_path=settings.GOLD_FEED_TIMESTAMP_PATH,
                    unit=settings.GOLD_FEED_UNIT,
                    max_age_seconds=settings.GOLD_FEED_MAX_SOURCE_AGE_SECONDS,
                )
        except FeedError as exc:
            # A provider HTTP failure never replaces the last verified rate.
            # An expired rate stops checkout via valid_until independently.
            with transaction.atomic():
                state,_=RateSyncState.objects.select_for_update().get_or_create(pk=1)
                state.last_attempt_at=now
                is_quota = isinstance(exc, ServixQuotaExceeded)
                if is_quota:
                    # Conservative 24-hour cooldown; Servix does not document reset time.
                    state.paused_until=now+timedelta(hours=24)
                    state.pause_reason='daily_quota_exceeded'
                code=getattr(exc,'code','FEED_ERROR')
                request_id=getattr(exc,'request_id',None)
                reason=f'{code}: {str(exc)}'
                if request_id: reason+=f' | requestId={request_id}'
                state.last_error=reason[:400]
                state.provider_name=provider
                state.save(update_fields=['last_attempt_at','last_error','provider_name',
                                          'paused_until','pause_reason'])
                RateSyncAttempt.objects.create(provider_name=provider,
                     status=RateSyncAttempt.Status.FAILED,details=reason[:400])
            log.warning('Gold rate fetch failed: %s',type(exc).__name__)
            return {'status':'quota_exceeded' if is_quota else 'failed',
                    'message':'upstream unavailable or invalid'}
    if observation.toman_per_gram<=0:
        raise ValueError('Observation must be positive')
    with transaction.atomic():
        state,_=RateSyncState.objects.select_for_update().get_or_create(pk=1)
        state.last_attempt_at=now
        state.provider_name=provider
        previous=GoldRate.objects.select_for_update().filter(karat=18,active=True).first()
        if (previous is not None and previous.source_observed_at == observation.observed_at
            and previous.toman_per_gram == observation.toman_per_gram):
            RateSyncAttempt.objects.create(provider_name=provider,status=RateSyncAttempt.Status.UNCHANGED,
                candidate_toman=observation.toman_per_gram,
                source_observed_at=observation.observed_at,details='داده تکراری معتبر؛ تاریخ اعتبار تمدید نشد.')
            state.save(update_fields=['last_attempt_at','provider_name'])
            return {'status':'unchanged','message':'No new source observation'}
        reason='تأیید انسانی نرخ اولیه برای شروع سیستم لازم است.' if previous is None else None
        if previous and previous.source_observed_at and observation.observed_at<=previous.source_observed_at:
            reason='مهر زمانی نرخ جدیدتر از نرخ فعلی نیست.'
        max_change=Decimal(str(settings.GOLD_FEED_MAX_CHANGE_PERCENT))
        if not Decimal('0')<max_change<=Decimal('100'):
            raise ValueError('GOLD_FEED_MAX_CHANGE_PERCENT must be within (0,100]')
        if previous and abs((observation.toman_per_gram-previous.toman_per_gram)/previous.toman_per_gram*100)>max_change:
            reason='نوسان بیش از آستانه مجاز؛ بررسی انسانی لازم است.'
        # Source must still be fresh, also for calls injected in tests.
        if observation.observed_at>now+timedelta(minutes=2) or now-observation.observed_at>timedelta(seconds=settings.GOLD_FEED_MAX_SOURCE_AGE_SECONDS):
            reason='زمان اعلام نرخ نامعتبر یا قدیمی است.'
        if reason:
            state.blocked=True
            state.last_error=reason
            state.save(update_fields=['blocked','last_error','last_attempt_at','provider_name'])
            RateSyncAttempt.objects.create(provider_name=provider,status=RateSyncAttempt.Status.REJECTED,
                candidate_toman=observation.toman_per_gram,source_observed_at=observation.observed_at,details=reason)
            return {'status':'rejected','message':reason}
        expiry=min(now+timedelta(seconds=settings.GOLD_FEED_VALID_SECONDS),
                   observation.observed_at+timedelta(seconds=settings.GOLD_FEED_VALID_SECONDS))
        if expiry<=now:
            state.blocked=True
            state.last_error='اعتبار نرخ پایان یافته است.'
            state.save(update_fields=['blocked','last_error','last_attempt_at','provider_name'])
            return {'status':'rejected','message':'rate is expired'}
        # One active per karat DB partial unique constraint; rollback-safe switch.
        GoldRate.objects.filter(karat=18,active=True).update(active=False)
        GoldRate.objects.create(karat=18,toman_per_gram=observation.toman_per_gram,
                source_note=provider[:250],source_observed_at=observation.observed_at,
                verified_at=now,valid_until=expiry,active=True)
        state.blocked=False
        state.last_error=''
        state.paused_until=None
        state.pause_reason=''
        state.last_success_at=now
        state.last_source_at=observation.observed_at
        state.save(update_fields=['blocked','last_error','paused_until','pause_reason','last_attempt_at','last_success_at','last_source_at','provider_name'])
        RateSyncAttempt.objects.create(provider_name=provider,status=RateSyncAttempt.Status.ACCEPTED,
             candidate_toman=observation.toman_per_gram,source_observed_at=observation.observed_at)
    return {'status':'accepted','rateTomanPerGram':str(observation.toman_per_gram)}


@transaction.atomic
def approve_reviewed_candidate(attempt_id,operator):
    """One-time initial or outlier acceptance by a superuser after independent verification.

    Requires recent feed timestamp; keeps original rejected row, writes a new acceptance audit.
    """
    if not operator.is_active or not operator.is_superuser:
        raise PermissionError('Only a superuser can override the rate safety gate.')
    state,_=RateSyncState.objects.select_for_update().get_or_create(pk=1)
    attempt=RateSyncAttempt.objects.select_for_update().get(pk=attempt_id)
    if attempt.status != RateSyncAttempt.Status.REJECTED or attempt.candidate_toman is None or attempt.source_observed_at is None:
        raise ValueError('Only rejected, timestamped candidates can be approved.')
    now=timezone.now()
    if (attempt.source_observed_at>now+timedelta(minutes=2) or
        now-attempt.source_observed_at>timedelta(seconds=settings.GOLD_FEED_MAX_SOURCE_AGE_SECONDS)):
        raise ValueError('Candidate is now stale; fetch a new licensed observation.')
    prev=GoldRate.objects.select_for_update().filter(karat=18,active=True).first()
    if prev and prev.source_observed_at and attempt.source_observed_at<=prev.source_observed_at:
        raise ValueError('Cannot replace current rate with older or equal source timestamp.')
    expiry=min(now+timedelta(seconds=settings.GOLD_FEED_VALID_SECONDS),
               attempt.source_observed_at+timedelta(seconds=settings.GOLD_FEED_VALID_SECONDS))
    if expiry<=now:raise ValueError('Candidate has expired.')
    GoldRate.objects.filter(karat=18,active=True).update(active=False)
    GoldRate.objects.create(karat=18,toman_per_gram=attempt.candidate_toman,
        source_note=attempt.provider_name,source_observed_at=attempt.source_observed_at,
        verified_at=now,verified_by=operator,valid_until=expiry,active=True)
    state.blocked=False
    state.last_error=''
    state.paused_until=None
    state.pause_reason=''
    state.last_success_at=now
    state.last_source_at=attempt.source_observed_at
    state.provider_name=attempt.provider_name
    state.save(update_fields=['blocked','last_error','paused_until','pause_reason','last_success_at','last_source_at','provider_name'])
    RateSyncAttempt.objects.create(provider_name=attempt.provider_name,
        status=RateSyncAttempt.Status.ACCEPTED,candidate_toman=attempt.candidate_toman,
        source_observed_at=attempt.source_observed_at,
        details=f'تأیید دستی توسط مدیر شماره {operator.pk}; تلاش اولیه {attempt.pk}')
    return attempt.candidate_toman


def market_status():
    rate,_,status=current_pricing_context(require_policy=False)
    state=RateSyncState.objects.filter(pk=1).first()
    pricing_status=current_pricing_context()[2]
    return {'currency':'TOMAN','karat':18,'status':status,'pricingStatus':pricing_status,
            'tomanPerGram':int(rate.toman_per_gram) if rate else None,
            'source':rate.source_note if rate else (state.provider_name if state else None),
            'observedAt':rate.source_observed_at.isoformat() if rate and rate.source_observed_at else None,
            'validUntil':rate.valid_until.isoformat() if rate else None,
            'pausedUntil':state.paused_until.isoformat() if state and state.paused_until else None}
