"""Product media contract: admin can upload genuine images or use HTTPS URLs."""
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase

from commerce.models import ProductImage


class ProductImageValidationTests(SimpleTestCase):
    def test_one_source_required(self):
        with self.assertRaises(ValidationError):
            ProductImage(alt='نمای محصول').clean()

    def test_https_source_is_accepted(self):
        ProductImage(url='https://example.com/a.jpg', alt='نمای محصول').clean()

    def test_file_source_is_accepted(self):
        img = SimpleUploadedFile('picture.jpg', b'test-file', content_type='image/jpeg')
        ProductImage(image=img, alt='نمای محصول').clean()

    def test_two_sources_not_allowed(self):
        img = SimpleUploadedFile('picture.jpg', b'test-file', content_type='image/jpeg')
        with self.assertRaises(ValidationError):
            ProductImage(url='https://example.com/a.jpg', image=img, alt='نمای محصول').clean()

    def test_oversized_file_is_rejected(self):
        img = SimpleUploadedFile('picture.jpg', b'x' * (8 * 1024 * 1024 + 1), content_type='image/jpeg')
        with self.assertRaises(ValidationError):
            ProductImage(image=img, alt='نمای محصول').clean()
