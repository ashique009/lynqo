import json
import logging
import time
from django.core.management.base import BaseCommand
from django.db import transaction
from django.conf import settings
from django.core.cache import cache
from accounts.models import Message

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        "Non-destructive migration command to inspect and securely transition legacy "
        "public Cloudinary chat images to Cloudinary authenticated storage."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--commit',
            action='store_true',
            help='Execute the migration. Without this flag, a safe dry run is performed.'
        )
        parser.add_argument(
            '--yes',
            action='store_true',
            help='Skip interactive confirmation when running with --commit.'
        )
        parser.add_argument(
            '--manifest',
            type=str,
            default=None,
            help='Output path for migration manifest JSON file (default: legacy_image_migration_<timestamp>.json).'
        )
        parser.add_argument(
            '--rollback',
            type=str,
            default=None,
            help='Path to a previously generated manifest file to reverse the migration.'
        )

    def handle(self, *args, **options):
        rollback_file = options.get('rollback')
        if rollback_file:
            self._handle_rollback(rollback_file)
            return

        is_commit = options.get('commit', False)
        skip_confirm = options.get('yes', False)

        c_cloud = getattr(settings, 'CLOUDINARY_CLOUD_NAME', None)
        c_key = getattr(settings, 'CLOUDINARY_API_KEY', None)
        c_secret = getattr(settings, 'CLOUDINARY_API_SECRET', None)

        self.stdout.write("=" * 70)
        self.stdout.write("LYNQO CLOUDINARY CHAT IMAGE SECURITY MIGRATION")
        self.stdout.write("=" * 70)

        # 1. Scan for legacy Cloudinary images in database
        candidates = Message.objects.filter(
            message_type='image'
        ).exclude(
            image_storage_id__isnull=True
        ).exclude(
            image_storage_id=''
        ).order_by('id')

        legacy_messages = []
        for msg in candidates:
            sid = msg.image_storage_id or ''
            # Local disk paths are skipped
            if sid.startswith('chat_images/') or sid.startswith('/'):
                continue
            # Already authenticated images are skipped
            if 'lynqo_chat_auth' in sid or '_auth' in sid or 'auth_' in sid:
                continue
            legacy_messages.append(msg)

        total_legacy = len(legacy_messages)
        self.stdout.write(f"Found {candidates.count()} total image records in database.")
        self.stdout.write(f"Found {total_legacy} legacy Cloudinary image records requiring authenticated migration.")

        if total_legacy == 0:
            self.stdout.write(self.style.SUCCESS("No legacy unauthenticated Cloudinary images found. All images are secure!"))
            return

        # Prepare proposed migration plan
        plan = []
        for msg in legacy_messages:
            old_main = msg.image_storage_id
            old_thumb = msg.image_thumbnail_id

            # Transform folder to lynqo_chat_auth
            if old_main.startswith('lynqo_chat/'):
                new_main = old_main.replace('lynqo_chat/', 'lynqo_chat_auth/', 1)
            else:
                new_main = f"lynqo_chat_auth/{msg.conversation_id}/auth_{old_main.replace('/', '_')}"

            new_thumb = None
            if old_thumb:
                if old_thumb.startswith('lynqo_chat/'):
                    new_thumb = old_thumb.replace('lynqo_chat/', 'lynqo_chat_auth/', 1)
                else:
                    new_thumb = f"lynqo_chat_auth/{msg.conversation_id}/thumbs/auth_{old_thumb.replace('/', '_')}"

            plan.append({
                'message_id': msg.id,
                'conversation_id': msg.conversation_id,
                'sender_id': msg.sender_id,
                'created_at': msg.created_at.isoformat(),
                'old_storage_id': old_main,
                'new_storage_id': new_main,
                'old_thumbnail_id': old_thumb,
                'new_thumbnail_id': new_thumb,
            })

        # Display sample plan
        self.stdout.write("\nSample Migration Mapping (first 5 records):")
        for item in plan[:5]:
            self.stdout.write(f"  Message #{item['message_id']} (Conv #{item['conversation_id']}):")
            self.stdout.write(f"    Main : {item['old_storage_id']}  -->  {item['new_storage_id']}")
            if item['old_thumbnail_id']:
                self.stdout.write(f"    Thumb: {item['old_thumbnail_id']}  -->  {item['new_thumbnail_id']}")

        if not is_commit:
            self.stdout.write("\n" + self.style.WARNING("DRY RUN COMPLETED: No assets or database records were changed."))
            self.stdout.write("To execute this migration against Cloudinary and the database, run:")
            self.stdout.write(self.style.NOTICE("  python manage.py migrate_legacy_cloudinary_images --commit"))
            return

        # Execution Mode (--commit)
        if not (c_cloud and c_key and c_secret):
            self.stderr.write(self.style.ERROR(
                "Cloudinary credentials (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) "
                "are required to execute migration."
            ))
            return

        if not skip_confirm:
            confirm = input(f"\nAre you sure you want to migrate {total_legacy} legacy images in Cloudinary? (yes/no): ")
            if confirm.lower() != 'yes':
                self.stdout.write("Migration aborted by user.")
                return

        import cloudinary.uploader

        manifest_path = options.get('manifest') or f"legacy_image_migration_{int(time.time())}.json"
        successful_migrations = []
        failed_migrations = []

        self.stdout.write("\nStarting Cloudinary authenticated migration...")

        for item in plan:
            msg_id = item['message_id']
            msg = Message.objects.get(id=msg_id)
            old_main = item['old_storage_id']
            new_main = item['new_storage_id']
            old_thumb = item['old_thumbnail_id']
            new_thumb = item['new_thumbnail_id']

            try:
                # 1. Rename main image in Cloudinary to type='authenticated'
                cloudinary.uploader.rename(
                    old_main,
                    new_main,
                    resource_type='image',
                    to_type='authenticated',
                    overwrite=False
                )

                # 2. Rename thumbnail if present
                if old_thumb and new_thumb:
                    try:
                        cloudinary.uploader.rename(
                            old_thumb,
                            new_thumb,
                            resource_type='image',
                            to_type='authenticated',
                            overwrite=False
                        )
                    except Exception as th_err:
                        self.stderr.write(f"Warning: Thumbnail rename failed for msg #{msg_id}: {th_err}")
                        new_thumb = old_thumb  # keep old if thumb rename fails

                # 3. Update database record atomically
                with transaction.atomic():
                    msg.image_storage_id = new_main
                    if new_thumb:
                        msg.image_thumbnail_id = new_thumb
                    msg.save(update_fields=['image_storage_id', 'image_thumbnail_id'])

                # 4. Invalidate cache
                cache.delete(f"image_signed_url:{msg.id}:0")
                cache.delete(f"image_signed_url:{msg.id}:1")

                successful_migrations.append(item)
                self.stdout.write(self.style.SUCCESS(f"  ✓ Migrated Message #{msg_id} -> {new_main}"))
            except Exception as err:
                self.stderr.write(self.style.ERROR(f"  ✗ Failed to migrate Message #{msg_id}: {err}"))
                failed_migrations.append({'item': item, 'error': str(err)})

        # Save manifest
        manifest_data = {
            'timestamp': time.time(),
            'total_planned': total_legacy,
            'successful_count': len(successful_migrations),
            'failed_count': len(failed_migrations),
            'successful': successful_migrations,
            'failed': failed_migrations
        }
        with open(manifest_path, 'w') as mf:
            json.dump(manifest_data, mf, indent=2)

        self.stdout.write(f"\nMigration manifest saved to: {manifest_path}")
        self.stdout.write(self.style.SUCCESS(f"Successfully migrated {len(successful_migrations)} / {total_legacy} images."))
        if failed_migrations:
            self.stdout.write(self.style.WARNING(f"{len(failed_migrations)} images failed migration. See manifest for details."))

    def _handle_rollback(self, rollback_file):
        """Reverses a previous migration using the saved manifest file."""
        self.stdout.write(f"Reading rollback manifest from: {rollback_file}")
        try:
            with open(rollback_file, 'r') as mf:
                data = json.load(mf)
        except Exception as e:
            self.stderr.write(self.style.ERROR(f"Failed to read rollback file: {e}"))
            return

        import cloudinary.uploader
        successful = data.get('successful', [])
        self.stdout.write(f"Found {len(successful)} records to rollback.")

        confirm = input(f"Are you sure you want to reverse migration for {len(successful)} images? (yes/no): ")
        if confirm.lower() != 'yes':
            self.stdout.write("Rollback cancelled.")
            return

        restored = 0
        for item in successful:
            msg_id = item['message_id']
            try:
                msg = Message.objects.get(id=msg_id)
                # Revert main image back to upload type
                cloudinary.uploader.rename(
                    item['new_storage_id'],
                    item['old_storage_id'],
                    resource_type='image',
                    to_type='upload',
                    overwrite=False
                )
                if item.get('new_thumbnail_id') and item.get('old_thumbnail_id'):
                    cloudinary.uploader.rename(
                        item['new_thumbnail_id'],
                        item['old_thumbnail_id'],
                        resource_type='image',
                        to_type='upload',
                        overwrite=False
                    )

                with transaction.atomic():
                    msg.image_storage_id = item['old_storage_id']
                    msg.image_thumbnail_id = item['old_thumbnail_id']
                    msg.save(update_fields=['image_storage_id', 'image_thumbnail_id'])

                cache.delete(f"image_signed_url:{msg.id}:0")
                cache.delete(f"image_signed_url:{msg.id}:1")
                restored += 1
                self.stdout.write(self.style.SUCCESS(f"  ✓ Rolled back Message #{msg_id} -> {item['old_storage_id']}"))
            except Exception as e:
                self.stderr.write(self.style.ERROR(f"  ✗ Rollback failed for Message #{msg_id}: {e}"))

        self.stdout.write(self.style.SUCCESS(f"Rollback complete: {restored} / {len(successful)} records restored."))
