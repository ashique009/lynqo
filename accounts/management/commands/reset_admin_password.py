from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()

class Command(BaseCommand):
    help = 'Create or reset the admin superuser'

    def handle(self, *args, **kwargs):
        username = 'ashique'
        email = 'ashiquekavanoor009@gmail.com'
        new_password = 'Chikkundo@123'

        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                'email': email,
                'full_name': 'Ashique',
                'phone': '9074258205',
            }
        )

        user.set_password(new_password)
        user.is_staff = True
        user.is_superuser = True
        user.save()

        if created:
            self.stdout.write(self.style.SUCCESS(f'Superuser "{username}" created successfully.'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Existing user "{username}" upgraded to superuser and password reset.'))