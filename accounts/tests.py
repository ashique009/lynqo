import io
import json
from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, TransactionTestCase, Client
from django.core.cache import cache
from django.urls import reverse
from accounts.models import (
    User, Profile, ProfileSession, ConnectRequest, Conversation, Message
)
from accounts.auth import SESSION_COOKIE_NAME


class BaseTestCase(TestCase):
    def setUp(self):
        super().setUp()
        cache.clear()

    def tearDown(self):
        cache.clear()
        super().tearDown()


def create_test_image(filename="avatar.png", size=(100, 100), color="blue", format="PNG"):
    file_obj = io.BytesIO()
    image = Image.new("RGBA", size=size, color=color)
    image.save(file_obj, format=format)
    file_obj.seek(0)
    return SimpleUploadedFile(filename, file_obj.read(), content_type=f"image/{format.lower()}")


class PasswordlessProfileTests(BaseTestCase):
    def setUp(self):
        self.client = Client()

    def test_create_profile_success(self):
        """Test passwordless profile creation with display name."""
        response = self.client.post('/api/auth/profile/create/', {
            'display_name': 'Alice Wonder'
        })
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertTrue(data['success'])
        self.assertIn('token', data)
        self.assertIn('recovery_code', data)
        self.assertTrue(data['recovery_code'].startswith('REC-'))
        profile = data['profile']
        self.assertEqual(profile['display_name'], 'Alice Wonder')
        self.assertTrue(profile['profile_id'].startswith('LYNQ-'))

        # Check HttpOnly session cookie
        self.assertIn(SESSION_COOKIE_NAME, response.cookies)
        cookie = response.cookies[SESSION_COOKIE_NAME]
        self.assertTrue(cookie['httponly'])

        # Verify DB records
        self.assertTrue(Profile.objects.filter(profile_id=profile['profile_id']).exists())
        self.assertTrue(ProfileSession.objects.filter(token=data['token'], is_active=True).exists())

    def test_create_profile_with_picture(self):
        """Test profile creation with uploaded picture."""
        avatar = create_test_image()
        response = self.client.post('/api/auth/profile/create/', {
            'display_name': 'Bob Builder',
            'profile_picture': avatar
        })
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIsNotNone(data['profile']['profile_picture'])

    def test_existing_profile_avatar_public_id_generates_image_url(self):
        """Historical avatars stored as extensionless Cloudinary public_ids generate valid image URLs, never raw/upload."""
        user = User.objects.create(username="LYNQ-IMG01", full_name="Image User")
        profile = Profile.objects.create(user=user, profile_id="LYNQ-IMG01", display_name="Image User")
        profile.profile_picture.name = "media/profile_pics/c3348121137e4705895fb20f42df0022_xxmc9u"
        profile.save()

        from accounts.serializers import ProfileDetailSerializer
        serializer_data = ProfileDetailSerializer(profile).data
        pic_url = serializer_data.get('profile_picture')
        self.assertIsNotNone(pic_url)
        self.assertNotIn('/raw/upload/', pic_url)

    def test_reject_invalid_image_upload(self):
        """Test rejection of non-image file spoofing an image extension."""
        fake_file = SimpleUploadedFile("fake.png", b"not an image file at all", content_type="image/png")
        response = self.client.post('/api/auth/profile/create/', {
            'display_name': 'Hacker',
            'profile_picture': fake_file
        })
        self.assertEqual(response.status_code, 400)

    def test_recover_profile_success_and_rotation(self):
        """Test recovering profile using single-use recovery code and verifying code rotation."""
        # 1. Create profile
        res1 = self.client.post('/api/auth/profile/create/', {'display_name': 'Charlie'})
        rec_code = res1.json()['recovery_code']
        prof_id = res1.json()['profile']['profile_id']

        # Clear cookies to simulate lost browser session
        self.client.cookies.clear()

        # 2. Recover profile
        res2 = self.client.post('/api/auth/profile/recover/', {'recovery_code': rec_code})
        self.assertEqual(res2.status_code, 200)
        data2 = res2.json()
        self.assertTrue(data2['success'])
        self.assertEqual(data2['profile']['profile_id'], prof_id)
        new_rec_code = data2['new_recovery_code']
        self.assertNotEqual(rec_code, new_rec_code)

        # 3. Old recovery code must now fail (single-use guarantee)
        self.client.cookies.clear()
        res3 = self.client.post('/api/auth/profile/recover/', {'recovery_code': rec_code})
        self.assertEqual(res3.status_code, 400)

        # 4. New recovery code works
        res4 = self.client.post('/api/auth/profile/recover/', {'recovery_code': new_rec_code})
        self.assertEqual(res4.status_code, 200)

    def test_recover_profile_invalid_code(self):
        """Test rejection of invalid recovery code."""
        response = self.client.post('/api/auth/profile/recover/', {'recovery_code': 'REC-99999-WRONGCODE'})
        self.assertEqual(response.status_code, 400)

    def test_profile_update_and_auth_protection(self):
        """Test updating profile authenticated and rejecting unauthenticated."""
        # Unauthenticated request fails
        res_unauth = self.client.put('/api/auth/profile/update/', {'display_name': 'Sneaky'}, content_type='application/json')
        self.assertIn(res_unauth.status_code, [401, 403])

        # Create profile and authenticate
        res_create = self.client.post('/api/auth/profile/create/', {'display_name': 'Original Name'})
        token = res_create.json()['token']

        # Update display name
        res_update = self.client.put(
            '/api/auth/profile/update/',
            data=json.dumps({'display_name': 'Updated Name'}),
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res_update.status_code, 200)
        self.assertEqual(res_update.json()['profile']['display_name'], 'Updated Name')

    def test_regenerate_recovery_code(self):
        """Test user can regenerate recovery code while authenticated."""
        res_create = self.client.post('/api/auth/profile/create/', {'display_name': 'Dave'})
        token = res_create.json()['token']
        old_code = res_create.json()['recovery_code']

        res_regen = self.client.post(
            '/api/auth/profile/regenerate-recovery-code/',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res_regen.status_code, 200)
        new_code = res_regen.json()['recovery_code']
        self.assertNotEqual(old_code, new_code)


class ConnectionRequestTests(BaseTestCase):
    def setUp(self):
        self.client = Client()
        # Create User A
        r_a = self.client.post('/api/auth/profile/create/', {'display_name': 'Alice'})
        self.token_a = r_a.json()['token']
        self.profile_a = r_a.json()['profile']

        # Create User B
        r_b = self.client.post('/api/auth/profile/create/', {'display_name': 'Bob'})
        self.token_b = r_b.json()['token']
        self.profile_b = r_b.json()['profile']

    def test_search_profile(self):
        """Search profiles by profile_id."""
        res = self.client.get(
            f"/api/auth/profiles/search/?profile_id={self.profile_b['profile_id']}",
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['profile']['display_name'], 'Bob')
        self.assertEqual(res.json()['connection_status'], 'none')

    def test_prevent_self_search_and_self_connect(self):
        """Prevent user from searching or connecting to themselves."""
        # Self search
        res1 = self.client.get(
            f"/api/auth/profiles/search/?profile_id={self.profile_a['profile_id']}",
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res1.status_code, 400)

        # Self connect
        res2 = self.client.post(
            "/api/auth/connections/request/",
            data=json.dumps({'profile_id': self.profile_a['profile_id']}),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res2.status_code, 400)

    def test_connection_request_lifecycle(self):
        """Send, view incoming/outgoing, accept, and verify connection."""
        # 1. Alice sends request to Bob
        res_send = self.client.post(
            "/api/auth/connections/request/",
            data=json.dumps({'profile_id': self.profile_b['profile_id']}),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res_send.status_code, 201)
        req_id = res_send.json()['request']['id']

        # 2. Prevent duplicate request
        res_dup = self.client.post(
            "/api/auth/connections/request/",
            data=json.dumps({'profile_id': self.profile_b['profile_id']}),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res_dup.status_code, 400)

        # 3. Bob checks incoming requests
        res_in = self.client.get(
            "/api/auth/connections/requests/incoming/",
            HTTP_AUTHORIZATION=f"Bearer {self.token_b}"
        )
        self.assertEqual(res_in.status_code, 200)
        self.assertEqual(len(res_in.json()['requests']), 1)
        self.assertEqual(res_in.json()['requests'][0]['sender']['profile_id'], self.profile_a['profile_id'])

        # 4. Unauthorized acceptance (Alice cannot accept her own sent request)
        res_unauth = self.client.post(
            f"/api/auth/connections/requests/{req_id}/accept/",
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res_unauth.status_code, 404)

        # 5. Bob accepts request
        res_acc = self.client.post(
            f"/api/auth/connections/requests/{req_id}/accept/",
            HTTP_AUTHORIZATION=f"Bearer {self.token_b}"
        )
        self.assertEqual(res_acc.status_code, 200)
        conv_id = res_acc.json()['conversation_id']
        self.assertIsNotNone(conv_id)

        # 6. Verify both users see each other in connected profiles
        res_conn_a = self.client.get("/api/auth/connections/", HTTP_AUTHORIZATION=f"Bearer {self.token_a}")
        self.assertEqual(len(res_conn_a.json()['connections']), 1)
        self.assertEqual(res_conn_a.json()['connections'][0]['profile']['profile_id'], self.profile_b['profile_id'])

    def test_cancel_and_decline_request(self):
        """Test cancelling outgoing request and declining incoming request."""
        # Alice sends request to Bob
        res_send = self.client.post(
            "/api/auth/connections/request/",
            data=json.dumps({'profile_id': self.profile_b['profile_id']}),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        req_id = res_send.json()['request']['id']

        # Alice cancels request
        res_cancel = self.client.post(
            f"/api/auth/connections/requests/{req_id}/cancel/",
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res_cancel.status_code, 200)
        req = ConnectRequest.objects.get(id=req_id)
        self.assertEqual(req.status, 'cancelled')


class RealTimeMessagingTests(BaseTestCase):
    def setUp(self):
        self.client = Client()
        # Create Alice & Bob
        r_a = self.client.post('/api/auth/profile/create/', {'display_name': 'Alice'})
        self.token_a = r_a.json()['token']
        self.profile_a = r_a.json()['profile']

        r_b = self.client.post('/api/auth/profile/create/', {'display_name': 'Bob'})
        self.token_b = r_b.json()['token']
        self.profile_b = r_b.json()['profile']

        # Connect Alice & Bob
        r_req = self.client.post(
            "/api/auth/connections/request/",
            data=json.dumps({'profile_id': self.profile_b['profile_id']}),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        req_id = r_req.json()['request']['id']
        r_acc = self.client.post(
            f"/api/auth/connections/requests/{req_id}/accept/",
            HTTP_AUTHORIZATION=f"Bearer {self.token_b}"
        )
        self.conv_id = r_acc.json()['conversation_id']

        # Create Charlie (unconnected user)
        r_c = self.client.post('/api/auth/profile/create/', {'display_name': 'Charlie'})
        self.token_c = r_c.json()['token']
        self.profile_c = r_c.json()['profile']

    def test_send_and_receive_messages_persisted(self):
        """Test sending message, database persistence, and message ordering."""
        # Alice sends message
        res_send = self.client.post(
            f"/api/auth/conversations/{self.conv_id}/messages/send/",
            data=json.dumps({
                'content': 'Hello Bob!',
                'client_message_id': 'client-uuid-1'
            }),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res_send.status_code, 201)
        msg_data = res_send.json()['message']
        self.assertEqual(msg_data['content'], 'Hello Bob!')
        self.assertEqual(msg_data['sender_profile_id'], self.profile_a['profile_id'])

        # Bob replies
        res_reply = self.client.post(
            f"/api/auth/conversations/{self.conv_id}/messages/send/",
            data=json.dumps({
                'content': 'Hey Alice!',
                'client_message_id': 'client-uuid-2'
            }),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_b}"
        )
        self.assertEqual(res_reply.status_code, 201)

        # Bob fetches message history
        res_list = self.client.get(
            f"/api/auth/conversations/{self.conv_id}/messages/",
            HTTP_AUTHORIZATION=f"Bearer {self.token_b}"
        )
        self.assertEqual(res_list.status_code, 200)
        messages = res_list.json()['messages']
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0]['content'], 'Hello Bob!')
        self.assertEqual(messages[1]['content'], 'Hey Alice!')

    def test_message_deduplication(self):
        """Test client_message_id deduplication prevents duplicate messages on retry."""
        payload = {
            'content': 'Deduplicate me',
            'client_message_id': 'idempotent-key-123'
        }
        res1 = self.client.post(
            f"/api/auth/conversations/{self.conv_id}/messages/send/",
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res1.status_code, 201)

        # Resend same client_message_id
        res2 = self.client.post(
            f"/api/auth/conversations/{self.conv_id}/messages/send/",
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res2.status_code, 200)
        self.assertTrue(res2.json().get('deduplicated'))

        # DB must have exactly 1 message
        self.assertEqual(Message.objects.filter(client_message_id='idempotent-key-123').count(), 1)

    def test_unauthorized_user_cannot_access_messages(self):
        """Test Charlie (not a participant) cannot read or send messages in Alice and Bob's conversation."""
        # Charlie tries to read
        res_read = self.client.get(
            f"/api/auth/conversations/{self.conv_id}/messages/",
            HTTP_AUTHORIZATION=f"Bearer {self.token_c}"
        )
        self.assertEqual(res_read.status_code, 403)

        # Charlie tries to send
        res_send = self.client.post(
            f"/api/auth/conversations/{self.conv_id}/messages/send/",
            data=json.dumps({'content': 'I am spying!'}),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_c}"
        )
        self.assertEqual(res_send.status_code, 403)

    def test_read_receipts_marked_seen(self):
        """Test that fetching messages marks incoming unread messages as seen."""
        # Alice sends message
        self.client.post(
            f"/api/auth/conversations/{self.conv_id}/messages/send/",
            data=json.dumps({'content': 'Unread until seen'}),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        msg = Message.objects.first()
        self.assertFalse(msg.is_read)

        # Bob opens the conversation (GET messages)
        self.client.get(
            f"/api/auth/conversations/{self.conv_id}/messages/",
            HTTP_AUTHORIZATION=f"Bearer {self.token_b}"
        )

        msg.refresh_from_db()
        self.assertTrue(msg.is_read)
        self.assertEqual(msg.status, 'seen')


from channels.testing import WebsocketCommunicator
from config.asgi import application
from asgiref.sync import sync_to_async

class WebSocketMessagingTests(TransactionTestCase):
    async def test_websocket_unauthenticated_rejected(self):
        """Websocket without token must be closed with code 4001."""
        communicator = WebsocketCommunicator(application, "/ws/chat/")
        connected, close_code = await communicator.connect()
        self.assertFalse(connected)
        self.assertEqual(close_code, 4001)

    async def test_websocket_authenticated_and_messaging(self):
        """Websocket with valid session token connects, sends and receives real-time messages."""
        # Create users synchronously
        @sync_to_async
        def setup_users():
            user1 = User.objects.create(username="LYNQ-WS001", full_name="User One")
            p1 = Profile.objects.create(user=user1, profile_id="LYNQ-WS001", display_name="User One")
            s1 = ProfileSession.objects.create(user=user1, token="ws-token-1")

            user2 = User.objects.create(username="LYNQ-WS002", full_name="User Two")
            p2 = Profile.objects.create(user=user2, profile_id="LYNQ-WS002", display_name="User Two")
            s2 = ProfileSession.objects.create(user=user2, token="ws-token-2")

            ConnectRequest.objects.create(sender=user1, receiver=user2, status='accepted')
            conv, _ = Conversation.get_or_create_between(user1, user2)
            return s1.token, s2.token, conv.id

        token1, token2, conv_id = await setup_users()

        # Connect both users
        comm1 = WebsocketCommunicator(application, f"/ws/chat/?token={token1}")
        conn1, _ = await comm1.connect()
        self.assertTrue(conn1)

        comm2 = WebsocketCommunicator(application, f"/ws/chat/?token={token2}")
        conn2, _ = await comm2.connect()
        self.assertTrue(conn2)

        async def receive_matching(comm, target_types):
            while True:
                msg = await comm.receive_json_from(timeout=3)
                if msg.get('type') in target_types:
                    return msg

        # Both join conversation room
        await comm1.send_json_to({'type': 'join_conversation', 'conversation_id': conv_id})
        res1 = await receive_matching(comm1, ['joined_conversation'])
        self.assertEqual(res1['type'], 'joined_conversation')

        await comm2.send_json_to({'type': 'join_conversation', 'conversation_id': conv_id})
        res2 = await receive_matching(comm2, ['joined_conversation'])
        self.assertEqual(res2['type'], 'joined_conversation')

        # User 1 sends message
        await comm1.send_json_to({
            'type': 'chat_message',
            'conversation_id': conv_id,
            'content': 'Real-time WebSocket Hello!',
            'client_message_id': 'ws-msg-1'
        })

        # User 2 receives broadcast
        incoming = await receive_matching(comm2, ['new_message'])
        self.assertEqual(incoming['type'], 'new_message')
        self.assertEqual(incoming['message']['content'], 'Real-time WebSocket Hello!')

        # User 1 receives ACK or broadcast
        msg_ack = await receive_matching(comm1, ['new_message', 'message_ack'])
        self.assertIn(msg_ack['type'], ['new_message', 'message_ack'])

        # User 1 sends typing indicator
        await comm1.send_json_to({
            'type': 'typing',
            'conversation_id': conv_id,
            'is_typing': True
        })
        typing_event = await receive_matching(comm2, ['typing_indicator'])
        self.assertEqual(typing_event['type'], 'typing_indicator')
        self.assertTrue(typing_event['is_typing'])

        await comm1.disconnect()
        await comm2.disconnect()


class ChatReliabilityRegressionTests(BaseTestCase):
    def setUp(self):
        self.client = Client()
        self.user1 = User.objects.create(username="LYNQ-REG01", full_name="User Reg 1")
        self.p1 = Profile.objects.create(user=self.user1, profile_id="LYNQ-REG01", display_name="User Reg 1")
        self.s1 = ProfileSession.objects.create(user=self.user1, token="reg-token-1")

        self.user2 = User.objects.create(username="LYNQ-REG02", full_name="User Reg 2")
        self.p2 = Profile.objects.create(user=self.user2, profile_id="LYNQ-REG02", display_name="User Reg 2")
        self.s2 = ProfileSession.objects.create(user=self.user2, token="reg-token-2")

        ConnectRequest.objects.create(sender=self.user1, receiver=self.user2, status='accepted')
        self.conv, _ = Conversation.get_or_create_between(self.user1, self.user2)

    def test_message_list_ordering_with_identical_timestamps(self):
        """Messages with identical created_at timestamps are deterministically sorted by id."""
        from django.utils import timezone
        fixed_time = timezone.now()
        m1 = Message.objects.create(
            conversation=self.conv,
            sender=self.user1,
            content="Message 1",
            client_message_id="cli-reg-1",
            status="sent",
            created_at=fixed_time
        )
        m2 = Message.objects.create(
            conversation=self.conv,
            sender=self.user1,
            content="Message 2",
            client_message_id="cli-reg-2",
            status="sent",
            created_at=fixed_time
        )

        response = self.client.get(
            f"/api/auth/conversations/{self.conv.id}/messages/",
            HTTP_AUTHORIZATION=f"Bearer {self.s1.token}"
        )
        self.assertEqual(response.status_code, 200)
        messages = response.json()['messages']
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0]['id'], m1.id)
        self.assertEqual(messages[1]['id'], m2.id)

    def test_message_list_view_updates_status_and_is_read_in_response(self):
        """MessageListView returns updated status='seen' and is_read=True in response payload."""
        msg = Message.objects.create(
            conversation=self.conv,
            sender=self.user1,
            content="Hello unread message",
            client_message_id="cli-unread-1",
            status="sent",
            is_read=False
        )

        # User 2 reads conversation
        response = self.client.get(
            f"/api/auth/conversations/{self.conv.id}/messages/",
            HTTP_AUTHORIZATION=f"Bearer {self.s2.token}"
        )
        self.assertEqual(response.status_code, 200)
        messages = response.json()['messages']
        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]['id'], msg.id)
        self.assertEqual(messages[0]['status'], 'seen')
        self.assertTrue(messages[0]['is_read'])

    def test_conversation_list_view_deterministic_last_message(self):
        """ConversationListView selects correct latest message by ID when timestamps match."""
        from django.utils import timezone
        fixed_time = timezone.now()
        m1 = Message.objects.create(
            conversation=self.conv,
            sender=self.user1,
            content="Early message",
            status="sent",
            created_at=fixed_time
        )
        m2 = Message.objects.create(
            conversation=self.conv,
            sender=self.user1,
            content="Latest message",
            status="sent",
            created_at=fixed_time
        )

        response = self.client.get(
            "/api/auth/conversations/",
            HTTP_AUTHORIZATION=f"Bearer {self.s1.token}"
        )
        self.assertEqual(response.status_code, 200)
        convs = response.json()['conversations']
        self.assertEqual(len(convs), 1)
        self.assertEqual(convs[0]['last_message']['id'], m2.id)
        self.assertEqual(convs[0]['last_message']['content'], "Latest message")

    def test_profile_me_returns_404_when_user_has_no_profile(self):
        """ProfileMeView returns 404 when authenticated user has no profile model."""
        orphan_user = User.objects.create(username="orphan_user")
        session = ProfileSession.objects.create(user=orphan_user, token="orphan-token")

        response = self.client.get(
            "/api/auth/profile/me/",
            HTTP_AUTHORIZATION=f"Bearer {session.token}"
        )
        self.assertEqual(response.status_code, 404)
        self.assertFalse(response.json()['success'])


class VoiceMessagingTests(BaseTestCase):
    def setUp(self):
        self.client = Client()
        self.user1 = User.objects.create(username="LYNQ-VOICE01", full_name="Voice User 1")
        self.p1 = Profile.objects.create(user=self.user1, profile_id="LYNQ-VOICE01", display_name="Voice User 1")
        self.s1 = ProfileSession.objects.create(user=self.user1, token="voice-token-1")

        self.user2 = User.objects.create(username="LYNQ-VOICE02", full_name="Voice User 2")
        self.p2 = Profile.objects.create(user=self.user2, profile_id="LYNQ-VOICE02", display_name="Voice User 2")
        self.s2 = ProfileSession.objects.create(user=self.user2, token="voice-token-2")

        # Third party user not in conversation
        self.user3 = User.objects.create(username="LYNQ-VOICE03", full_name="Voice User 3")
        self.p3 = Profile.objects.create(user=self.user3, profile_id="LYNQ-VOICE03", display_name="Voice User 3")
        self.s3 = ProfileSession.objects.create(user=self.user3, token="voice-token-3")

        ConnectRequest.objects.create(sender=self.user1, receiver=self.user2, status='accepted')
        self.conv, _ = Conversation.get_or_create_between(self.user1, self.user2)

        # Standard minimal WAV bytes (44 bytes valid header)
        self.wav_bytes = b'RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00D\xac\x00\x00\x88X\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00'

    def test_voice_message_upload_success(self):
        """User uploads voice message, verifies metadata and audio url."""
        audio_file = SimpleUploadedFile("test_voice.wav", self.wav_bytes, content_type="audio/wav")
        response = self.client.post(
            f"/api/auth/conversations/{self.conv.id}/messages/voice/",
            {
                'audio': audio_file,
                'duration': 15,
                'client_message_id': 'cli-voice-001'
            },
            HTTP_AUTHORIZATION=f"Bearer {self.s1.token}"
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertTrue(data['success'])
        msg = data['message']
        self.assertEqual(msg['message_type'], 'voice')
        self.assertEqual(msg['duration_seconds'], 15)
        self.assertEqual(msg['client_message_id'], 'cli-voice-001')
        self.assertTrue(msg['audio_url'].startswith(f"/api/auth/conversations/{self.conv.id}/messages/"))

    def test_voice_message_upload_deduplication(self):
        """Uploading voice message with existing client_message_id returns deduplicated message."""
        audio_file1 = SimpleUploadedFile("test1.wav", self.wav_bytes, content_type="audio/wav")
        res1 = self.client.post(
            f"/api/auth/conversations/{self.conv.id}/messages/voice/",
            {'audio': audio_file1, 'duration': 10, 'client_message_id': 'cli-dedup-voice'},
            HTTP_AUTHORIZATION=f"Bearer {self.s1.token}"
        )
        self.assertEqual(res1.status_code, 201)

        audio_file2 = SimpleUploadedFile("test2.wav", self.wav_bytes, content_type="audio/wav")
        res2 = self.client.post(
            f"/api/auth/conversations/{self.conv.id}/messages/voice/",
            {'audio': audio_file2, 'duration': 10, 'client_message_id': 'cli-dedup-voice'},
            HTTP_AUTHORIZATION=f"Bearer {self.s1.token}"
        )
        self.assertEqual(res2.status_code, 200)
        self.assertTrue(res2.json().get('deduplicated'))
        self.assertEqual(res1.json()['message']['id'], res2.json()['message']['id'])

    def test_voice_message_duration_limit_enforced(self):
        """Voice messages exceeding 2 minutes limit are rejected."""
        audio_file = SimpleUploadedFile("test.wav", self.wav_bytes, content_type="audio/wav")
        response = self.client.post(
            f"/api/auth/conversations/{self.conv.id}/messages/voice/",
            {'audio': audio_file, 'duration': 180},
            HTTP_AUTHORIZATION=f"Bearer {self.s1.token}"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("exceeds 2 minutes", response.json()['message'])

    def test_voice_message_file_size_limit_enforced(self):
        """Audio files exceeding 10MB limit are rejected."""
        large_bytes = b'0' * (11 * 1024 * 1024)
        audio_file = SimpleUploadedFile("huge.wav", large_bytes, content_type="audio/wav")
        response = self.client.post(
            f"/api/auth/conversations/{self.conv.id}/messages/voice/",
            {'audio': audio_file, 'duration': 30},
            HTTP_AUTHORIZATION=f"Bearer {self.s1.token}"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("10MB", response.json()['message'])

    def test_voice_message_unsupported_format_rejected(self):
        """Non-audio file is rejected."""
        fake_file = SimpleUploadedFile("malicious.exe", b"MZ\x90\x00this is not audio", content_type="application/octet-stream")
        response = self.client.post(
            f"/api/auth/conversations/{self.conv.id}/messages/voice/",
            {'audio': fake_file, 'duration': 10},
            HTTP_AUTHORIZATION=f"Bearer {self.s1.token}"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unsupported", response.json()['message'])

    def test_adaptive_cloudinary_storage_routing(self):
        """AdaptiveCloudinaryStorage routes audio to video and avatars/public IDs to image."""
        from accounts.storage import AdaptiveCloudinaryStorage
        from unittest.mock import patch
        storage = AdaptiveCloudinaryStorage()
        # Audio extensions
        for ext in ['webm', 'mp3', 'mp4', 'ogg', 'wav', 'aac', 'm4a', 'opus', 'weba']:
            self.assertEqual(storage._get_resource_type(f"voice_file.{ext}"), 'video')
        # Image extensions
        for ext in ['jpg', 'png', 'webp', 'gif']:
            self.assertEqual(storage._get_resource_type(f"avatar.{ext}"), 'image')
        # Critical regression: extensionless Cloudinary public IDs (historical profile avatars) must be 'image'
        self.assertEqual(storage._get_resource_type("profile_pics/c3348121137e4705895fb20f42df0022_xxmc9u"), 'image')
        self.assertEqual(storage._get_resource_type("profile_pics/923f0c1a49ab490c97c75cd7e7a1e40c_b4lpvr"), 'image')

        # Test upload options: images must have type='upload' (public), audio must have type='authenticated'
        with patch('cloudinary.uploader.upload') as mock_cld_upload:
            storage._upload("profile_pics/avatar.jpg", b"fake_jpg")
            _, kwargs_img = mock_cld_upload.call_args
            self.assertEqual(kwargs_img.get('resource_type'), 'image')
            self.assertEqual(kwargs_img.get('type'), 'upload')

            storage._upload("lynqo_voice/1/voice_test.webm", b"fake_audio")
            _, kwargs_voice = mock_cld_upload.call_args
            self.assertEqual(kwargs_voice.get('resource_type'), 'video')
            self.assertEqual(kwargs_voice.get('type'), 'authenticated')

    def test_profile_session_authentication_in_memory_caching(self):
        """ProfileSessionAuthentication caches valid session tokens in memory to avoid repeated DB lookups."""
        from accounts.auth import ProfileSessionAuthentication, invalidate_session_cache
        from django.test import RequestFactory
        factory = RequestFactory()
        auth = ProfileSessionAuthentication()

        req1 = factory.get('/api/auth/profile/me/', HTTP_AUTHORIZATION=f"Bearer {self.s1.token}")
        user1, sess1 = auth.authenticate(req1)
        self.assertEqual(user1.id, self.user1.id)

        # Second request should resolve from cache with 0 queries
        req2 = factory.get('/api/auth/profile/me/', HTTP_AUTHORIZATION=f"Bearer {self.s1.token}")
        with self.assertNumQueries(0):
            user2, sess2 = auth.authenticate(req2)
            self.assertEqual(user2.id, self.user1.id)

        # Invalidate cache
        invalidate_session_cache(self.s1.token)
        req3 = factory.get('/api/auth/profile/me/', HTTP_AUTHORIZATION=f"Bearer {self.s1.token}")
        with self.assertNumQueries(1):
            user3, sess3 = auth.authenticate(req3)
            self.assertEqual(user3.id, self.user1.id)

    def test_voice_message_cloudinary_upload_uses_video_resource_type(self):
        """Voice upload with Cloudinary credentials passes resource_type='video' and authenticated type."""
        from unittest.mock import patch
        from django.conf import settings
        with patch.object(settings, 'CLOUDINARY_CLOUD_NAME', 'mock_cloud'), \
             patch.object(settings, 'CLOUDINARY_API_KEY', 'mock_key'), \
             patch.object(settings, 'CLOUDINARY_API_SECRET', 'mock_secret'), \
             patch('cloudinary.uploader.upload') as mock_upload, \
             patch('cloudinary.utils.cloudinary_url', return_value=('https://res.cloudinary.com/mock/signed_audio.webm', {})):

            mock_upload.return_value = {
                'public_id': 'lynqo_voice/test/voice_123',
                'secure_url': 'https://res.cloudinary.com/mock/voice_123.webm',
                'resource_type': 'video'
            }

            webm_header = b'\x1aE\xdf\xa3\x9f\x42\x86\x81\x01\x42\xf7\x81\x01\x42\xf2\x81\x04\x42\x87\x81\x02\x42\x85\x81\x02' + b'\x00' * 50
            audio_file = SimpleUploadedFile("recording.webm", webm_header, content_type="audio/webm")

            response = self.client.post(
                f"/api/auth/conversations/{self.conv.id}/messages/voice/",
                {'audio': audio_file, 'duration': 12, 'client_message_id': 'cli-cld-voice-1'},
                HTTP_AUTHORIZATION=f"Bearer {self.s1.token}"
            )
            self.assertEqual(response.status_code, 201)
            data = response.json()
            self.assertTrue(data['success'])
            created_msg = Message.objects.get(id=data['message']['id'])
            self.assertEqual(created_msg.audio_storage_id, 'lynqo_voice/test/voice_123')

            # Verify upload call kwargs
            mock_upload.assert_called_once()
            _, kwargs = mock_upload.call_args
            self.assertEqual(kwargs.get('resource_type'), 'video')
            self.assertEqual(kwargs.get('type'), 'authenticated')

            # Verify playback URL generation
            msg_id = data['message']['id']
            res_audio = self.client.get(
                f"/api/auth/conversations/{self.conv.id}/messages/{msg_id}/audio/?json=1",
                HTTP_AUTHORIZATION=f"Bearer {self.s1.token}"
            )
            self.assertEqual(res_audio.status_code, 200)
            self.assertEqual(res_audio.json()['audio_url'], 'https://res.cloudinary.com/mock/signed_audio.webm')

    def test_voice_message_upload_exception_returns_json_never_html(self):
        """Unexpected internal exceptions in voice upload return structured JSON 500, never Django HTML."""
        from unittest.mock import patch
        audio_file = SimpleUploadedFile("test_err.wav", self.wav_bytes, content_type="audio/wav")

        with patch('accounts.models.Message.save', side_effect=RuntimeError("Database failure simulated")):
            response = self.client.post(
                f"/api/auth/conversations/{self.conv.id}/messages/voice/",
                {'audio': audio_file, 'duration': 5, 'client_message_id': 'cli-err-voice'},
                HTTP_AUTHORIZATION=f"Bearer {self.s1.token}"
            )
            self.assertEqual(response.status_code, 500)
            self.assertTrue(response.headers['Content-Type'].startswith('application/json'))
            self.assertEqual(response.json()['success'], False)
            self.assertIn('Failed to process voice recording', response.json()['message'])

    def test_voice_message_unauthorized_upload_denied(self):
        """Non-participant cannot upload audio to another user's conversation."""
        audio_file = SimpleUploadedFile("test.wav", self.wav_bytes, content_type="audio/wav")
        response = self.client.post(
            f"/api/auth/conversations/{self.conv.id}/messages/voice/",
            {'audio': audio_file, 'duration': 10},
            HTTP_AUTHORIZATION=f"Bearer {self.s3.token}"
        )
        self.assertEqual(response.status_code, 403)

    def test_voice_message_audio_retrieval_authorized_and_unauthorized(self):
        """Participants can retrieve voice message audio; third parties receive 403 Forbidden."""
        audio_file = SimpleUploadedFile("test_retrieve.wav", self.wav_bytes, content_type="audio/wav")
        res_upload = self.client.post(
            f"/api/auth/conversations/{self.conv.id}/messages/voice/",
            {'audio': audio_file, 'duration': 8},
            HTTP_AUTHORIZATION=f"Bearer {self.s1.token}"
        )
        msg_id = res_upload.json()['message']['id']

        # 1. Sender (User 1) can retrieve
        res_auth1 = self.client.get(
            f"/api/auth/conversations/{self.conv.id}/messages/{msg_id}/audio/",
            HTTP_AUTHORIZATION=f"Bearer {self.s1.token}"
        )
        self.assertEqual(res_auth1.status_code, 200)

        # 2. Recipient (User 2) can retrieve
        res_auth2 = self.client.get(
            f"/api/auth/conversations/{self.conv.id}/messages/{msg_id}/audio/",
            HTTP_AUTHORIZATION=f"Bearer {self.s2.token}"
        )
        self.assertEqual(res_auth2.status_code, 200)

        # 3. Unauthorized third party (User 3) receives 403 Forbidden
        res_unauth = self.client.get(
            f"/api/auth/conversations/{self.conv.id}/messages/{msg_id}/audio/",
            HTTP_AUTHORIZATION=f"Bearer {self.s3.token}"
        )
        self.assertEqual(res_unauth.status_code, 403)


class MessagePerformanceAndReliabilityTests(BaseTestCase):
    def setUp(self):
        self.client = Client()
        self.user1 = User.objects.create(username="LYNQ-PERF01", full_name="Perf User 1")
        self.p1 = Profile.objects.create(user=self.user1, profile_id="LYNQ-PERF01", display_name="Perf User 1")
        self.s1 = ProfileSession.objects.create(user=self.user1, token="perf-token-1")

        self.user2 = User.objects.create(username="LYNQ-PERF02", full_name="Perf User 2")
        self.p2 = Profile.objects.create(user=self.user2, profile_id="LYNQ-PERF02", display_name="Perf User 2")
        self.s2 = ProfileSession.objects.create(user=self.user2, token="perf-token-2")

        ConnectRequest.objects.create(sender=self.user1, receiver=self.user2, status='accepted')
        self.conv, _ = Conversation.get_or_create_between(self.user1, self.user2)

    def test_message_list_eliminates_n_plus_one_queries(self):
        """Fetching 30 messages should execute O(1) queries (<= 5), eliminating N+1 queries."""
        msgs = [
            Message(
                conversation=self.conv,
                sender=self.user1 if i % 2 == 0 else self.user2,
                content=f"Performance message {i}",
                client_message_id=f"perf-cli-{i}",
                status='sent'
            )
            for i in range(30)
        ]
        Message.objects.bulk_create(msgs)

        with self.assertNumQueries(5):
            # 1: Session lookup, 2: Conversation auth lookup, 3: Batched message query,
            # 4: Mark unread seen update, 5: LastSeen middleware update
            response = self.client.get(
                f"/api/auth/conversations/{self.conv.id}/messages/?limit=20",
                HTTP_AUTHORIZATION=f"Bearer {self.s1.token}"
            )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['success'])
        self.assertEqual(len(data['messages']), 20)
        self.assertTrue(data['has_more'])
        # Verify serialization includes conversation_id without extra queries
        self.assertEqual(data['messages'][0]['conversation_id'], self.conv.id)

    def test_message_send_idempotent_deduplication(self):
        """Sending messages with identical client_message_id returns existing record without duplicating."""
        client_msg_id = "unique-client-uuid-999"
        res1 = self.client.post(
            f"/api/auth/conversations/{self.conv.id}/messages/send/",
            data={'content': 'Hello once', 'client_message_id': client_msg_id},
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.s1.token}"
        )
        self.assertEqual(res1.status_code, 201)
        first_id = res1.json()['message']['id']

        # Send again with same client_message_id
        res2 = self.client.post(
            f"/api/auth/conversations/{self.conv.id}/messages/send/",
            data={'content': 'Hello once', 'client_message_id': client_msg_id},
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.s1.token}"
        )
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.json()['message']['id'], first_id)
        self.assertTrue(res2.json().get('deduplicated'))

        # DB must have exactly 1 record
        self.assertEqual(Message.objects.filter(client_message_id=client_msg_id).count(), 1)


class DirectMessagingAndSearchTests(BaseTestCase):
    def setUp(self):
        self.client = Client()
        # Create Alice
        r_a = self.client.post('/api/auth/profile/create/', {'display_name': 'Alice Springs'})
        self.token_a = r_a.json()['token']
        self.profile_a = r_a.json()['profile']

        # Create Bob
        r_b = self.client.post('/api/auth/profile/create/', {'display_name': 'Bob Dylan'})
        self.token_b = r_b.json()['token']
        self.profile_b = r_b.json()['profile']

        # Create Charlie
        r_c = self.client.post('/api/auth/profile/create/', {'display_name': 'Charlie Chaplin'})
        self.token_c = r_c.json()['token']
        self.profile_c = r_c.json()['profile']

    def test_search_by_display_name_and_profile_id(self):
        """Users can search by display name substring or exact Profile ID."""
        # Search by display name
        res_name = self.client.get(
            '/api/auth/profiles/search/?query=Dylan',
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res_name.status_code, 200)
        data_name = res_name.json()
        self.assertTrue(data_name['success'])
        self.assertGreaterEqual(len(data_name['profiles']), 1)
        self.assertEqual(data_name['profiles'][0]['display_name'], 'Bob Dylan')

        # Search by exact profile ID
        res_id = self.client.get(
            f"/api/auth/profiles/search/?profile_id={self.profile_b['profile_id']}",
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res_id.status_code, 200)
        data_id = res_id.json()
        self.assertEqual(data_id['profile']['profile_id'], self.profile_b['profile_id'])

    def test_start_conversation_and_direct_message_without_approval(self):
        """User A can start a conversation with User B and message directly without friend request."""
        # 1. Alice initiates conversation with Bob directly
        res_conv = self.client.post(
            '/api/auth/conversations/',
            data=json.dumps({'profile_id': self.profile_b['profile_id']}),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res_conv.status_code, 201)
        conv_id = res_conv.json()['conversation']['id']
        self.assertTrue(res_conv.json()['created'])

        # 2. Alice sends text message directly — no friend request or approval required!
        res_msg = self.client.post(
            f"/api/auth/conversations/{conv_id}/messages/send/",
            data=json.dumps({
                'content': 'Hello Bob! Direct messaging works!',
                'client_message_id': 'direct-msg-001'
            }),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res_msg.status_code, 201)
        self.assertEqual(res_msg.json()['message']['content'], 'Hello Bob! Direct messaging works!')

        # 3. Bob sends a reply directly
        res_reply = self.client.post(
            f"/api/auth/conversations/{conv_id}/messages/send/",
            data=json.dumps({
                'content': 'Awesome Alice, glad to chat!',
                'client_message_id': 'direct-reply-002'
            }),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_b}"
        )
        self.assertEqual(res_reply.status_code, 201)

        # 4. Repeated initiation reuses the existing conversation
        res_dup = self.client.post(
            '/api/auth/conversations/',
            data=json.dumps({'profile_id': self.profile_b['profile_id']}),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res_dup.status_code, 200)
        self.assertEqual(res_dup.json()['conversation']['id'], conv_id)
        self.assertFalse(res_dup.json()['created'])

        # 5. Database has exactly 1 conversation
        self.assertEqual(Conversation.objects.count(), 1)

    def test_prevent_conversation_with_self(self):
        """User cannot initiate a conversation with their own profile ID."""
        res = self.client.post(
            '/api/auth/conversations/',
            data=json.dumps({'profile_id': self.profile_a['profile_id']}),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res.status_code, 400)
        self.assertFalse(res.json()['success'])





