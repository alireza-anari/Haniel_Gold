from django.db import migrations, models
import django.core.validators
import commerce.models


class Migration(migrations.Migration):
    dependencies = [
        ('commerce', '0003_servix_quota_cooldown'),
    ]

    operations = [
        migrations.AlterField(
            model_name='productimage',
            name='url',
            field=models.URLField(blank=True, max_length=800, validators=[commerce.validators.https_url]),
        ),
        migrations.AddField(
            model_name='productimage',
            name='image',
            field=models.ImageField(blank=True, null=True, upload_to=commerce.models.product_photo_upload_path,
                validators=[django.core.validators.FileExtensionValidator(['jpg', 'jpeg', 'png', 'webp'])]),
        ),
    ]
