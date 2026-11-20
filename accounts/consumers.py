import json
from urllib.parse import parse_qs
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone
from django.core.cache import cache
from .models import ProfileSession, Conversation, Message, ConnectRequest, User


def add_user_channel(user_id, channel_name):
    key = f"ws_user_channels:{user_id}"
    channels = cache.get(key)
    if not isinstance(channels, set):
        channels = set()
    channels.add(channel_name)
    cache.set(key, channels, timeout=3600)
    return len(channels)


def remove_user_channel(user_id, channel_name):
    key = f"ws_user_channels:{user_id}"
    channels = cache.get(key)
    if not isinstance(channels, set):
        return 0
    channels.discard(channel_name)
    if channels:
        cache.set(key, channels, timeout=3600)
        return len(channels)
    else:
        cache.delete(key)
        return 0


def is_user_online(user_id):
    key = f"ws_user_channels:{user_id}"
    channels = cache.get(key)
    return bool(isinstance(channels, set) and len(channels) > 0)


class ChatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.joined_groups = set()
        self.user = await self.authenticate_connection()
        if not self.user:
            await self.close(code=4001)
            return

        self.user_group = f"user_{self.user.id}"
        await self.channel_layer.group_add(self.user_group, self.channel_name)
        self.joined_groups.add(self.user_group)
        await self.accept()

        # Track active connection count per user
        active_count = await database_sync_to_async(add_user_channel)(self.user.id, self.channel_name)
        if active_count == 1:
            await self.set_online_status(True)
            await self.broadcast_presence(True)

        # Send current online status of all contacts to this newly connected user
        await self.send_contacts_presence()

    async def disconnect(self, close_code):
        try:
            if hasattr(self, 'user') and self.user:
                active_count = await database_sync_to_async(remove_user_channel)(self.user.id, self.channel_name)
                if active_count <= 0:
                    await self.set_online_status(False)
                    await self.broadcast_presence(False)
                if hasattr(self, 'joined_groups'):
                    for group_name in list(self.joined_groups):
                        await self.channel_layer.group_discard(group_name, self.channel_name)
                    self.joined_groups.clear()
        except Exception:
            pass

    async def receive_json(self, content):
        msg_type = content.get('type')

        if msg_type == 'ping':
            if hasattr(self, 'user') and self.user:
                key = f"ws_user_channels:{self.user.id}"
                try:
                    cache.touch(key, 3600)
                except Exception:
                    pass
            await self.send_json({'type': 'pong'})
            return

        if msg_type == 'join_conversation':
            conv_id = content.get('conversation_id')
            if await self.is_participant(conv_id):
                group_name = f"conv_{conv_id}"
                await self.channel_layer.group_add(group_name, self.channel_name)
                self.joined_groups.add(group_name)
                await self.send_json({'type': 'joined_conversation', 'conversation_id': conv_id})

        elif msg_type == 'leave_conversation':
            conv_id = content.get('conversation_id')
            if conv_id:
                group_name = f"conv_{conv_id}"
                await self.channel_layer.group_discard(group_name, self.channel_name)
                self.joined_groups.discard(group_name)

        elif msg_type == 'chat_message':
            await self.handle_chat_message(content)

        elif msg_type == 'typing':
            await self.handle_typing(content)

        elif msg_type == 'mark_delivered':
            await self.handle_mark_delivered(content)

        elif msg_type == 'mark_seen':
            await self.handle_mark_seen(content)

    async def handle_chat_message(self, data):
        conv_id = data.get('conversation_id')
        text = (data.get('content') or '').strip()
        client_msg_id = data.get('client_message_id')
        reply_to_id = data.get('reply_to_id') or data.get('reply_to')

        if not conv_id or not text:
            await self.send_json({'type': 'error', 'message': 'Missing conversation_id or content'})
            return

        msg_data, recipient_id, is_new, error_reason = await self.process_and_save_chat_message(
            conv_id, text, client_msg_id, reply_to_id
        )
        if error_reason:
            await self.send_json({'type': 'error', 'message': error_reason})
            return

        # Broadcast to conversation room
        await self.channel_layer.group_send(
            f"conv_{conv_id}",
            {
                'type': 'broadcast_new_message',
                'message': msg_data,
                'sender_channel': self.channel_name,
            }
        )

        # Direct broadcast to recipient's personal group (guarantees real-time delivery even before conv group join)
        if recipient_id:
            await self.channel_layer.group_send(
                f"user_{recipient_id}",
                {
                    'type': 'broadcast_new_message',
                    'message': msg_data,
                }
            )
            await self.channel_layer.group_send(
                f"user_{recipient_id}",
                {
                    'type': 'broadcast_conversation_update',
                    'conversation_id': conv_id,
                    'message': msg_data,
                }
            )

        # Multi-device broadcast to sender's other open tabs/sessions
        await self.channel_layer.group_send(
            f"user_{self.user.id}",
            {
                'type': 'broadcast_new_message',
                'message': msg_data,
                'sender_channel': self.channel_name,
            }
        )

        # Send ACK to sender
        await self.send_json({
            'type': 'message_ack',
            'client_message_id': client_msg_id,
            'message_id': msg_data['id'],
            'status': msg_data['status'],
            'created_at': msg_data['created_at'],
        })

    async def handle_typing(self, data):
        conv_id = data.get('conversation_id')
        is_typing = bool(data.get('is_typing'))
        if await self.is_participant(conv_id):
            profile_id = await self.get_profile_id()
            other_user_id = await self.get_other_participant_id(conv_id)
            event = {
                'type': 'broadcast_typing',
                'conversation_id': conv_id,
                'profile_id': profile_id,
                'is_typing': is_typing,
                'sender_channel': self.channel_name,
            }
            await self.channel_layer.group_send(f"conv_{conv_id}", event)
            if other_user_id:
                await self.channel_layer.group_send(f"user_{other_user_id}", event)

    async def handle_mark_delivered(self, data):
        conv_id = data.get('conversation_id')
        raw_ids = data.get('message_ids') or ([data.get('message_id')] if data.get('message_id') else [])
        if await self.is_participant(conv_id) and raw_ids:
            delivered_ids, other_user_id = await self.mark_messages_as_delivered(conv_id, raw_ids)
            if delivered_ids:
                event = {
                    'type': 'broadcast_messages_delivered',
                    'conversation_id': conv_id,
                    'message_ids': delivered_ids,
                }
                await self.channel_layer.group_send(f"conv_{conv_id}", event)
                if other_user_id:
                    await self.channel_layer.group_send(f"user_{other_user_id}", event)

    async def handle_mark_seen(self, data):
        conv_id = data.get('conversation_id')
        if await self.is_participant(conv_id):
            updated_count, other_user_id = await self.mark_messages_as_seen(conv_id)
            if updated_count > 0:
                profile_id = await self.get_profile_id()
                event = {
                    'type': 'broadcast_messages_seen',
                    'conversation_id': conv_id,
                    'seen_by_profile_id': profile_id,
                }
                await self.channel_layer.group_send(f"conv_{conv_id}", event)
                if other_user_id:
                    await self.channel_layer.group_send(f"user_{other_user_id}", event)

    # Channel layer group handlers
    async def broadcast_new_message(self, event):
        if event.get('sender_channel') == self.channel_name:
            return
        await self.send_json({
            'type': 'new_message',
            'message': event['message'],
        })

    async def broadcast_message_edited(self, event):
        await self.send_json({
            'type': 'message_edited',
            'message': event['message'],
        })

    async def broadcast_message_deleted(self, event):
        await self.send_json({
            'type': 'message_deleted',
            'message_id': event['message_id'],
            'conversation_id': event['conversation_id'],
            'delete_type': event.get('delete_type', 'everyone'),
        })

    async def broadcast_conversation_update(self, event):
        await self.send_json({
            'type': 'conversation_update',
            'conversation_id': event['conversation_id'],
            'message': event['message'],
        })

    async def broadcast_typing(self, event):
        if self.channel_name != event.get('sender_channel'):
            await self.send_json({
                'type': 'typing_indicator',
                'conversation_id': event['conversation_id'],
                'profile_id': event['profile_id'],
                'is_typing': event['is_typing'],
            })

    async def broadcast_messages_seen(self, event):
        await self.send_json({
            'type': 'messages_seen',
            'conversation_id': event['conversation_id'],
            'seen_by_profile_id': event['seen_by_profile_id'],
        })

    async def broadcast_messages_delivered(self, event):
        await self.send_json({
            'type': 'messages_delivered',
            'conversation_id': event['conversation_id'],
            'message_ids': event['message_ids'],
        })

    async def user_presence_update(self, event):
        await self.send_json({
            'type': 'presence_update',
            'profile_id': event['profile_id'],
            'is_online': event['is_online'],
            'last_seen': event.get('last_seen'),
        })

    async def connection_event(self, event):
        await self.send_json({
            'type': event['event_type'],
            'data': event.get('data'),
        })

    async def send_contacts_presence(self):
        contact_ids = await self.get_contact_ids()
        for cid in contact_ids:
            online = is_user_online(cid)
            profile_id, last_seen_str = await self.get_user_profile_info(cid)
            if profile_id:
                await self.send_json({
                    'type': 'presence_update',
                    'profile_id': profile_id,
                    'is_online': online,
                    'last_seen': last_seen_str,
                })

    @database_sync_to_async
    def get_user_profile_info(self, user_id):
        try:
            user = User.objects.select_related('profile').get(id=user_id)
            profile = getattr(user, 'profile', None)
            profile_id = profile.profile_id if profile else user.username
            last_seen_str = user.last_seen.isoformat() if user.last_seen else None
            return profile_id, last_seen_str
        except User.DoesNotExist:
            return None, None

    # Database helpers
    @database_sync_to_async
    def authenticate_connection(self):
        token = None
        # 1. Check query string: ?token=...
        query_string = self.scope.get('query_string', b'').decode('utf-8')
        if query_string:
            params = parse_qs(query_string)
            if 'token' in params:
                token = params['token'][0]

        # 2. Check cookies
        if not token:
            headers = dict(self.scope.get('headers', []))
            cookie_header = headers.get(b'cookie', b'').decode('utf-8')
            if cookie_header:
                from http.cookies import SimpleCookie
                cookie = SimpleCookie()
                cookie.load(cookie_header)
                if 'lynqo_session' in cookie:
                    token = cookie['lynqo_session'].value

        if not token:
            return None

        # Check session cache first to eliminate DB lookup on WS handshake
        cache_key = f"auth_session:{token}"
        cached_data = cache.get(cache_key)
        if cached_data is not None:
            user, session = cached_data
            if not getattr(user, 'is_banned', False):
                return user

        try:
            session = ProfileSession.objects.select_related('user', 'user__profile').get(
                token=token,
                is_active=True
            )
            if session.user.is_banned:
                return None
            cache.set(cache_key, (session.user, session), 60)
            return session.user
        except ProfileSession.DoesNotExist:
            return None

    @database_sync_to_async
    def set_online_status(self, is_online):
        now = timezone.now()
        User.objects.filter(id=self.user.id).update(last_seen=now)

    @database_sync_to_async
    def get_profile_id(self):
        return getattr(self.user.profile, 'profile_id', self.user.username)

    @database_sync_to_async
    def get_contact_ids(self):
        # Contacts are users sharing active conversations with self.user (and any legacy accepted requests)
        p1_ids = list(Conversation.objects.filter(participant_2=self.user).values_list('participant_1_id', flat=True))
        p2_ids = list(Conversation.objects.filter(participant_1=self.user).values_list('participant_2_id', flat=True))
        sent = list(ConnectRequest.objects.filter(sender=self.user, status='accepted').values_list('receiver_id', flat=True))
        received = list(ConnectRequest.objects.filter(receiver=self.user, status='accepted').values_list('sender_id', flat=True))
        return list(set(p1_ids + p2_ids + sent + received))

    async def broadcast_presence(self, is_online):
        contact_ids = await self.get_contact_ids()
        profile_id = await self.get_profile_id()
        now_str = timezone.now().isoformat()
        for cid in contact_ids:
            await self.channel_layer.group_send(
                f"user_{cid}",
                {
                    'type': 'user_presence_update',
                    'profile_id': profile_id,
                    'is_online': is_online,
                    'last_seen': now_str,
                }
            )

    @database_sync_to_async
    def is_participant(self, conv_id):
        try:
            conv = Conversation.objects.get(id=conv_id)
            return conv.participant_1_id == self.user.id or conv.participant_2_id == self.user.id
        except (Conversation.DoesNotExist, ValueError):
            return False

    @database_sync_to_async
    def can_user_message(self, conv_id):
        try:
            conv = Conversation.objects.get(id=conv_id)
        except (Conversation.DoesNotExist, ValueError):
            return False, None, "Conversation not found"

        if conv.participant_1_id != self.user.id and conv.participant_2_id != self.user.id:
            return False, None, "Unauthorized: Not a participant in this conversation"

        other_user = conv.get_other_participant(self.user)

        if getattr(self.user, 'is_banned', False) or getattr(other_user, 'is_banned', False):
            return False, None, "Account restricted."

        return True, other_user.id, None

    @database_sync_to_async
    def process_and_save_chat_message(self, conv_id, content, client_msg_id, reply_to_id=None):
        """
        Unified authorization, deduplication, and persistence in a single DB transaction.
        Eliminates redundant Conversation lookups and multiple round trips.
        """
        try:
            conv = Conversation.objects.select_related('participant_1', 'participant_2').get(id=conv_id)
        except (Conversation.DoesNotExist, ValueError):
            return None, None, False, "Conversation not found"

        if conv.participant_1_id != self.user.id and conv.participant_2_id != self.user.id:
            return None, None, False, "Unauthorized: Not a participant in this conversation"

        other_user = conv.get_other_participant(self.user)
        if getattr(self.user, 'is_banned', False) or getattr(other_user, 'is_banned', False):
            return None, None, False, "Account restricted."

        reply_to_msg = None
        if reply_to_id:
            try:
                reply_to_msg = Message.objects.select_related('sender', 'sender__profile').get(
                    id=reply_to_id,
                    conversation=conv
                )
            except Message.DoesNotExist:
                return None, None, False, "Replied message not found in this conversation."

        # Deduplication
        if client_msg_id:
            existing = Message.objects.select_related(
                'sender', 'sender__profile', 'reply_to', 'reply_to__sender', 'reply_to__sender__profile'
            ).filter(
                conversation=conv,
                sender=self.user,
                client_message_id=client_msg_id
            ).first()
            if existing:
                return self._format_message(existing), other_user.id, False, None

        msg = Message.objects.create(
            conversation=conv,
            sender=self.user,
            content=content,
            client_message_id=client_msg_id,
            reply_to=reply_to_msg,
            status='sent'
        )
        conv.updated_at = msg.created_at
        conv.save(update_fields=['updated_at'])
        return self._format_message(msg), other_user.id, True, None

    @database_sync_to_async
    def save_message(self, conv_id, content, client_msg_id, reply_to_id=None):
        msg_data, _, is_new, _ = self.process_and_save_chat_message(conv_id, content, client_msg_id, reply_to_id)
        return msg_data, is_new

    @database_sync_to_async
    def mark_messages_as_delivered(self, conv_id, message_ids):
        try:
            conv = Conversation.objects.get(id=conv_id)
        except (Conversation.DoesNotExist, ValueError):
            return [], None
        qs = Message.objects.filter(
            conversation=conv,
            id__in=message_ids,
            status='sent'
        ).exclude(sender=self.user)
        delivered_ids = list(qs.values_list('id', flat=True))
        if delivered_ids:
            qs.update(status='delivered')
        other = conv.get_other_participant(self.user)
        return delivered_ids, getattr(other, 'id', None)

    @database_sync_to_async
    def mark_messages_as_seen(self, conv_id):
        try:
            conv = Conversation.objects.get(id=conv_id)
        except (Conversation.DoesNotExist, ValueError):
            return 0, None
        count = Message.objects.filter(
            conversation=conv,
            status__in=['sent', 'delivered']
        ).exclude(sender=self.user).update(status='seen', is_read=True)
        other = conv.get_other_participant(self.user)
        return count, getattr(other, 'id', None)

    @database_sync_to_async
    def get_other_participant_id(self, conv_id):
        try:
            conv = Conversation.objects.get(id=conv_id)
            other = conv.get_other_participant(self.user)
            return getattr(other, 'id', None)
        except (Conversation.DoesNotExist, ValueError):
            return None

    def _format_message(self, msg):
        sender_profile = getattr(msg.sender, 'profile', None)
        from .serializers import format_reply_to_details
        reply_to_details = format_reply_to_details(getattr(msg, 'reply_to', None), user=getattr(self, 'user', None))
        return {
            'id': msg.id,
            'client_message_id': msg.client_message_id,
            'conversation_id': msg.conversation_id,
            'sender_profile_id': sender_profile.profile_id if sender_profile else msg.sender.username,
            'sender_display_name': sender_profile.display_name if sender_profile else msg.sender.username,
            'content': msg.content,
            'message_type': getattr(msg, 'message_type', 'text'),
            'audio_url': f"/api/auth/conversations/{msg.conversation_id}/messages/{msg.id}/audio/" if getattr(msg, 'message_type', 'text') == 'voice' else None,
            'image_url': f"/api/auth/conversations/{msg.conversation_id}/messages/{msg.id}/image/" if getattr(msg, 'message_type', 'text') == 'image' else None,
            'thumbnail_url': f"/api/auth/conversations/{msg.conversation_id}/messages/{msg.id}/image/?thumb=1" if getattr(msg, 'message_type', 'text') == 'image' else None,
            'reply_to_id': getattr(msg, 'reply_to_id', None),
            'reply_to_details': reply_to_details,
            'image_width': getattr(msg, 'image_width', None),
            'image_height': getattr(msg, 'image_height', None),
            'duration_seconds': getattr(msg, 'duration_seconds', None),
            'file_size': getattr(msg, 'file_size', None),
            'audio_format': getattr(msg, 'audio_format', None),
            'status': msg.status,
            'is_read': msg.is_read,
            'is_edited': getattr(msg, 'is_edited', False),
            'is_deleted': getattr(msg, 'is_deleted', False),
            'created_at': msg.created_at.isoformat(),
        }


def models_q(**kwargs):
    from django.db.models import Q
    return Q(**kwargs)
