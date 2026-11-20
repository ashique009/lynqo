import secrets
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.db import models
from django.utils import timezone
from accounts.models import Profile, ProfileSession
from accounts.auth import invalidate_session_cache
from accounts.views import generate_recovery_code

User = get_user_model()


class Command(BaseCommand):
    help = (
        "Owner-controlled recovery procedure: reset a user's password and/or generate a new recovery code.\n"
        "Usage: python manage.py reset_account_access <username_or_profile_id> [--password <pwd>] [--generate-recovery-code]"
    )

    def add_arguments(self, parser):
        parser.add_argument('username', type=str, help='Username or Profile ID of the account to recover.')
        parser.add_argument('--password', type=str, default=None, help='Set a new password (min 4 characters).')
        parser.add_argument(
            '--generate-recovery-code',
            action='store_true',
            help='Generate a new single-use recovery code and print it for the owner.'
        )
        parser.add_argument(
            '--revoke-sessions',
            action='store_true',
            default=True,
            help='Revoke all active sessions for this account (default True).'
        )

    def handle(self, *args, **options):
        identifier = options['username'].strip()
        new_password = options.get('password')
        generate_code = options.get('generate_recovery_code')
        revoke_sessions = options.get('revoke_sessions', True)

        user = User.objects.filter(
            models.Q(username__iexact=identifier) | models.Q(profile__profile_id__iexact=identifier)
        ).select_related('profile').first()

        if not user:
            raise CommandError(f"User with username or profile ID '{identifier}' does not exist.")

        profile = getattr(user, 'profile', None)
        if not profile:
            profile_id = Profile.generate_unique_profile_id()
            profile = Profile.objects.create(
                user=user,
                profile_id=profile_id,
                display_name=user.full_name or user.username
            )

        self.stdout.write(self.style.SUCCESS(f"Found account: {user.username} (Profile ID: {profile.profile_id})"))

        if not new_password and not generate_code:
            self.stdout.write(self.style.WARNING("No changes requested. Specify --password <pwd> or --generate-recovery-code."))
            return

        # 1. Update password if requested
        if new_password:
            if len(new_password) < 4:
                raise CommandError("Password must be at least 4 characters long.")
            user.set_password(new_password)  # Uses Argon2!
            user.save()
            self.stdout.write(self.style.SUCCESS("✓ Password updated successfully (Argon2 hash)."))

        # 2. Revoke active sessions
        if revoke_sessions:
            active_sessions = ProfileSession.objects.filter(user=user, is_active=True)
            count = active_sessions.count()
            for s in active_sessions:
                s.is_active = False
                s.save(update_fields=['is_active'])
                invalidate_session_cache(s.token)
            self.stdout.write(self.style.SUCCESS(f"✓ Revoked {count} active device session(s)."))

        # 3. Generate recovery code if requested
        if generate_code:
            new_code = generate_recovery_code(profile.profile_id)
            profile.recovery_code_hash = make_password(new_code)
            profile.recovery_code_created_at = timezone.now()
            profile.save(update_fields=['recovery_code_hash', 'recovery_code_created_at'])
            self.stdout.write(self.style.SUCCESS("=" * 60))
            self.stdout.write(self.style.SUCCESS(f"NEW RECOVERY CODE: {new_code}"))
            self.stdout.write(self.style.SUCCESS("=" * 60))
            self.stdout.write(self.style.NOTICE("Provide this code securely to the account owner. It is single-use."))
