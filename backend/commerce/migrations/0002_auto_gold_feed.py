from django.db import migrations,models
import django.core.validators

class Migration(migrations.Migration):
    dependencies=[('commerce','0001_initial')]
    operations=[
        migrations.AddField(model_name='product',name='workmanship_fixed_toman',field=models.DecimalField(decimal_places=0,default=0,max_digits=17,validators=[django.core.validators.MinValueValidator(0)],help_text='اجرت ثابت به تومان؛ علاوه بر اجرت درصدی')),
        migrations.AddField(model_name='goldrate',name='source_observed_at',field=models.DateTimeField(blank=True,null=True,help_text='زمان اعلام نرخ از طرف منبع')),
        migrations.CreateModel(name='RateSyncState',fields=[('id',models.PositiveSmallIntegerField(primary_key=True,serialize=False,default=1,editable=False)),('blocked',models.BooleanField(default=True)),('last_attempt_at',models.DateTimeField(blank=True,null=True)),('last_success_at',models.DateTimeField(blank=True,null=True)),('last_source_at',models.DateTimeField(blank=True,null=True)),('last_error',models.CharField(blank=True,max_length=400)),('provider_name',models.CharField(default='licensed_feed',max_length=80))]),
        migrations.CreateModel(name='RateSyncAttempt',fields=[('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),('created_at',models.DateTimeField(auto_now_add=True)),('status',models.CharField(max_length=16,choices=[('accepted','پذیرفته شد'),('unchanged','بدون تغییر'),('rejected','مردود / مشکوک'),('failed','عدم دریافت')])),('provider_name',models.CharField(max_length=80)),('source_observed_at',models.DateTimeField(blank=True,null=True)),('candidate_toman',models.DecimalField(blank=True,decimal_places=2,max_digits=19,null=True)),('details',models.CharField(blank=True,max_length=400))],options={'ordering':['-created_at','-id']}),
    ]
