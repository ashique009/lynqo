import json
from urllib.parse import parse_qs
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone
from .models import ProfileSession, Conversation, Message, ConnectRequest, User


class ChatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.user = await self.authenticate_connection()
        if not self.user:
            await self.close(code=4001)
            return

        self.user_group = f"user_{self.user.id}"
        await self.channel_layer.group_add(self.user_group, self.channel_name)
        await self.accept()

        # Update presence and broadcast online status to contacts
        await self.set_online_status(True)
        await self.broadcast_presence(True)

    async def disconnect(self, close_code):
        try:
            if hasattr(self, 'user') and self.user:
                await self.set_online_status(False)
                await self.broadcast_presence(False)
                if hasattr(self, 'user_group'):
                    await self.channel_layer.group_discard(self.user_group, self.channel_name)
        except Exception:
            pass

    async def receive_json(self, content):
        msg_type = content.get('type')

        if msg_type == 'ping':
            await self.send_json({'type': 'pong'})
            return

        if msg_type == 'join_conversation':
            conv_id = content.get('conversation_id')
            if await self.is_participant(conv_id):
                group_name = f"conv_{conv_id}"
                await self.channel_layer.group_add(group_name, self.channel_name)
                await self.send_json({'type': 'joined_conversation', 'conversation_id': conv_id})

        elif msg_type == 'leave_conversation':
            conv_id = content.get('conversation_id')
            if conv_id:
                group_name = f"conv_{conv_id}"
                await self.channel_layer.group_discard(group_name, self.channel_name)

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

        if not conv_id or not text:
            await self.send_json({'type': 'error', 'message': 'Missing conversation_id or content'})
            return

        # Check authorization and connection status
        can_message, recipient_id, error_reason = await self.can_user_message(conv_id)
        if not can_message:
            await self.send_json({'type': 'error', 'message': error_reason})
            return

        # Save or get deduplicated message
        msg_data, is_new = await self.save_message(conv_id, text, client_msg_id)

        # Broadcast to conversation room
        await self.channel_layer.group_send(
            f"conv_{conv_id}",
            {
                'type': 'broadcast_new_message',
                'message': msg_data,
            }
        )

        # Also push notification event to recipient's personal group
        if recipient_id:
            await self.channel_layer.group_send(
                f"user_{recipient_id}",
                {
                    'type': 'broadcast_conversation_update',
                    'conversation_id': conv_id,
                    'message': msg_data,
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
            await self.channel_layer.group_send(
                f"conv_{conv_id}",
                {
                    'type': 'broadcast_typing',
                    'conversation_id': conv_id,
                    'profile_id': profile_id,
                    'is_typing': is_typing,
                    'sender_channel': self.channel_name,
                }
            )

    async def handle_mark_delivered(self, data):
        conv_id = data.get('conversation_id')
        raw_ids = data.get('message_ids') or ([data.get('message_id')] if data.get('message_id') else [])
        if await self.is_participant(conv_id) and raw_ids:
            delivered_ids = await self.mark_messages_as_delivered(conv_id, raw_ids)
            if delivered_ids:
                await self.channel_layer.group_send(
                    f"conv_{conv_id}",
                    {
                        'type': 'broadcast_messages_delivered',
                        'conversation_id': conv_id,
                        'message_ids': delivered_ids,
                    }
                )

    async def handle_mark_seen(self, data):
        conv_id = data.get('conversation_id')
        if await self.is_participant(conv_id):
            updated_count = await self.mark_messages_as_seen(conv_id)
            if updated_count > 0:
                profile_id = await self.get_profile_id()
                await self.channel_layer.group_send(
                    f"conv_{conv_id}",
                    {
                        'type': 'broadcast_messages_seen',
                        'conversation_id': conv_id,
                        'seen_by_profile_id': profile_id,
                    }
                )

    # Channel layer group handlers
    async def broadcast_new_message(self, event):
        await self.send_json({
            'type': 'new_message',
            'message': event['message'],
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

        try:
            session = ProfileSession.objects.select_related('user', 'user__profile').get(
                token=token,
                is_active=True
            )
            if session.user.is_banned:
                return None
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
        # Contacts are users with accepted ConnectRequests
        sent = ConnectRequest.objects.filter(sender=self.user, status='accepted').values_list('receiver_id', flat=True)
        received = ConnectRequest.objects.filter(receiver=self.user, status='accepted').values_list('sender_id', flat=True)
        return list(set(list(sent) + list(received)))

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

        # Check if an accepted connection exists
        is_connected = ConnectRequest.objects.filter(
            (models_q(sender=self.user, receiver=other_user) | models_q(sender=other_user, receiver=self.user)),
            status='accepted'
        ).exists()

        if not is_connected:
            return False, None, "You can only message accepted connections."

        return True, other_user.id, None

    @database_sync_to_async
    def save_message(self, conv_id, content, client_msg_id):
        conv = Conversation.objects.get(id=conv_id)

        # Deduplication
        if client_msg_id:
            existing = Message.objects.filter(
                conversation=conv,
                sender=self.user,
                client_message_id=client_msg_id
            ).first()
            if existing:
                return self._format_message(existing), False

        msg = Message.objects.create(
            conversation=conv,
            sender=self.user,
            content=content,
            client_message_id=client_msg_id,
            status='sent'
        )
        conv.updated_at = msg.created_at
        conv.save(update_fields=['updated_at'])
        return self._format_message(msg), True

    @database_sync_to_async
    def mark_messages_as_delivered(self, conv_id, message_ids):
        conv = Conversation.objects.get(id=conv_id)
        qs = Message.objects.filter(
            conversation=conv,
            id__in=message_ids,
            status='sent'
        ).exclude(sender=self.user)
        delivered_ids = list(qs.values_list('id', flat=True))
        if delivered_ids:
            qs.update(status='delivered')
        return delivered_ids

    @database_sync_to_async
    def mark_messages_as_seen(self, conv_id):
        conv = Conversation.objects.get(id=conv_id)
        return Message.objects.filter(
            conversation=conv,
            status__in=['sent', 'delivered']
        ).exclude(sender=self.user).update(status='seen', is_read=True)

    def _format_message(self, msg):
        sender_profile = getattr(msg.sender, 'profile', None)
        return {
            'id': msg.id,
            'client_message_id': msg.client_message_id,
            'conversation_id': msg.conversation_id,
            'sender_profile_id': sender_profile.profile_id if sender_profile else msg.sender.username,
            'sender_display_name': sender_profile.display_name if sender_profile else msg.sender.username,
            'content': msg.content,
            'message_type': getattr(msg, 'message_type', 'text'),
            'audio_url': f"/api/auth/conversations/{msg.conversation_id}/messages/{msg.id}/audio/" if getattr(msg, 'message_type', 'text') == 'voice' else None,
            'duration_seconds': getattr(msg, 'duration_seconds', None),
            'file_size': getattr(msg, 'file_size', None),
            'audio_format': getattr(msg, 'audio_format', None),
            'status': msg.status,
            'is_read': msg.is_read,
            'created_at': msg.created_at.isoformat(),
        }


def models_q(**kwargs):
    from django.db.models import Q
    return Q(**kwargs)
