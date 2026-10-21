from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('commerce', '0002_auto_gold_feed')]
    operations = [
        migrations.AddField(model_name='ratesyncstate', name='paused_until', field=models.DateTimeField(blank=True, null=True, help_text='مکث خودکار پس از پایان سهمیه سرویکس')),
        migrations.AddField(model_name='ratesyncstate', name='pause_reason', field=models.CharField(blank=True, max_length=64)),
    ]
