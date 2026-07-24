import os
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = 'Create or reset the admin superuser (reads ADMIN_* env vars)'

    def handle(self, *args, **kwargs):
        username = os.environ.get('ADMIN_USERNAME', 'admin')
        email = os.environ.get('ADMIN_EMAIL')
        password = os.environ.get('ADMIN_PASSWORD')

        if not email or not password:
            self.stderr.write(
                self.style.ERROR('Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables.')
            )
            return

        user, created = User.objects.get_or_create(
            username=username,
            defaults={'email': email},
        )

        user.email = email
        user.set_password(password)
        user.is_staff = True
        user.is_superuser = True
        user.save()

        if created:
            self.stdout.write(self.style.SUCCESS(f'Superuser "{username}" created successfully.'))
        else:
            self.stdout.write(self.style.SUCCESS(f'User "{username}" upgraded to superuser and password reset.'))
