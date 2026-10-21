from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('v1/', include('commerce.urls')),
]
admin.site.site_header = 'HANI-EL GOLD — مدیریت'
admin.site.site_title = 'HANI-EL GOLD'
