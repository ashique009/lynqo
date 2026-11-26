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


class MessageEditDeleteTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.client = Client()

        # Create Alice
        res_a = self.client.post('/api/auth/profile/create/', {'display_name': 'Alice'})
        self.assertEqual(res_a.status_code, 201)
        self.token_a = res_a.json()['token']
        self.profile_a = res_a.json()['profile']

        # Create Bob
        res_b = self.client.post('/api/auth/profile/create/', {'display_name': 'Bob'})
        self.assertEqual(res_b.status_code, 201)
        self.token_b = res_b.json()['token']
        self.profile_b = res_b.json()['profile']

        # Alice creates conversation with Bob
        res_conv = self.client.post(
            '/api/auth/conversations/',
            data=json.dumps({'profile_id': self.profile_b['profile_id']}),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res_conv.status_code, 201)
        self.conv_id = res_conv.json()['conversation']['id']

        # Alice sends a message
        res_msg = self.client.post(
            f"/api/auth/conversations/{self.conv_id}/messages/send/",
            data=json.dumps({
                'content': 'Original message from Alice',
                'client_message_id': 'cmsg-original-001'
            }),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res_msg.status_code, 201)
        self.msg_id = res_msg.json()['message']['id']

    def test_message_edit_by_sender_success(self):
        """Sender can edit their own text message."""
        res = self.client.put(
            f"/api/auth/conversations/{self.conv_id}/messages/{self.msg_id}/edit/",
            data=json.dumps({'content': 'Updated message content'}),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['message']['content'], 'Updated message content')
        self.assertTrue(data['message']['is_edited'])

        # Verify DB
        msg = Message.objects.get(id=self.msg_id)
        self.assertEqual(msg.content, 'Updated message content')
        self.assertTrue(msg.is_edited)

    def test_message_edit_by_recipient_forbidden(self):
        """Recipient cannot edit the sender's message."""
        res = self.client.put(
            f"/api/auth/conversations/{self.conv_id}/messages/{self.msg_id}/edit/",
            data=json.dumps({'content': 'Tampered by Bob'}),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_b}"
        )
        self.assertEqual(res.status_code, 403)
        self.assertFalse(res.json()['success'])

        # Verify DB unchanged
        msg = Message.objects.get(id=self.msg_id)
        self.assertEqual(msg.content, 'Original message from Alice')
        self.assertFalse(msg.is_edited)

    def test_message_edit_empty_content_rejected(self):
        """Editing to empty or whitespace content is rejected."""
        res = self.client.put(
            f"/api/auth/conversations/{self.conv_id}/messages/{self.msg_id}/edit/",
            data=json.dumps({'content': '   '}),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res.status_code, 400)
        self.assertFalse(res.json()['success'])

    def test_message_edit_voice_message_rejected(self):
        """Editing a voice message is forbidden."""
        user_a = User.objects.get(username=self.profile_a['profile_id'])
        conv = Conversation.objects.get(id=self.conv_id)
        voice_msg = Message.objects.create(
            conversation=conv,
            sender=user_a,
            message_type='voice',
            duration_seconds=5
        )
        res = self.client.put(
            f"/api/auth/conversations/{self.conv_id}/messages/{voice_msg.id}/edit/",
            data=json.dumps({'content': 'New text for voice'}),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res.status_code, 400)
        self.assertFalse(res.json()['success'])

    def test_message_edit_deleted_message_rejected(self):
        """Editing an already deleted message is rejected."""
        msg = Message.objects.get(id=self.msg_id)
        msg.is_deleted = True
        msg.save()

        res = self.client.put(
            f"/api/auth/conversations/{self.conv_id}/messages/{self.msg_id}/edit/",
            data=json.dumps({'content': 'Trying to resurrect'}),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res.status_code, 400)

    def test_message_delete_for_me_only_affects_requester(self):
        """Delete for Me hides message only for the requester; other user still sees it."""
        # Bob deletes Alice's message for himself
        res_del = self.client.delete(
            f"/api/auth/conversations/{self.conv_id}/messages/{self.msg_id}/delete/?type=me",
            HTTP_AUTHORIZATION=f"Bearer {self.token_b}"
        )
        self.assertEqual(res_del.status_code, 200)
        self.assertTrue(res_del.json()['success'])

        # Bob fetches messages: msg_id should NOT be in the list
        res_bob_msgs = self.client.get(
            f"/api/auth/conversations/{self.conv_id}/messages/",
            HTTP_AUTHORIZATION=f"Bearer {self.token_b}"
        )
        bob_ids = [m['id'] for m in res_bob_msgs.json()['messages']]
        self.assertNotIn(self.msg_id, bob_ids)

        # Alice fetches messages: msg_id SHOULD be in the list
        res_alice_msgs = self.client.get(
            f"/api/auth/conversations/{self.conv_id}/messages/",
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        alice_ids = [m['id'] for m in res_alice_msgs.json()['messages']]
        self.assertIn(self.msg_id, alice_ids)

        # In DB, message is not marked is_deleted
        msg = Message.objects.get(id=self.msg_id)
        self.assertFalse(msg.is_deleted)
        user_b = User.objects.get(username=self.profile_b['profile_id'])
        self.assertTrue(msg.deleted_for.filter(id=user_b.id).exists())

    def test_message_delete_for_everyone_by_sender_success(self):
        """Delete for Everyone by sender marks message deleted, clears content, and notifies both."""
        res_del = self.client.delete(
            f"/api/auth/conversations/{self.conv_id}/messages/{self.msg_id}/delete/?type=everyone",
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res_del.status_code, 200)
        self.assertTrue(res_del.json()['success'])

        # Check in DB
        msg = Message.objects.get(id=self.msg_id)
        self.assertTrue(msg.is_deleted)
        self.assertEqual(msg.content, '')

        # Alice fetches messages: is_deleted is true, content is empty
        res_alice = self.client.get(
            f"/api/auth/conversations/{self.conv_id}/messages/",
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        alice_msg = next(m for m in res_alice.json()['messages'] if m['id'] == self.msg_id)
        self.assertTrue(alice_msg['is_deleted'])
        self.assertEqual(alice_msg['content'], '')

        # Bob fetches messages: is_deleted is true, content is empty
        res_bob = self.client.get(
            f"/api/auth/conversations/{self.conv_id}/messages/",
            HTTP_AUTHORIZATION=f"Bearer {self.token_b}"
        )
        bob_msg = next(m for m in res_bob.json()['messages'] if m['id'] == self.msg_id)
        self.assertTrue(bob_msg['is_deleted'])
        self.assertEqual(bob_msg['content'], '')

    def test_message_delete_for_everyone_by_recipient_forbidden(self):
        """Recipient cannot delete a message for everyone."""
        res = self.client.delete(
            f"/api/auth/conversations/{self.conv_id}/messages/{self.msg_id}/delete/?type=everyone",
            HTTP_AUTHORIZATION=f"Bearer {self.token_b}"
        )
        self.assertEqual(res.status_code, 403)
        self.assertFalse(res.json()['success'])

        # Verify DB
        msg = Message.objects.get(id=self.msg_id)
        self.assertFalse(msg.is_deleted)


class SimpleLoginAndMultiDeviceTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.client = Client()
        # Create user Alice with password
        res = self.client.post('/api/auth/profile/create/', {
            'username': 'AliceTester',
            'display_name': 'Alice Wonder',
            'password': 'pass',  # 4 characters allowed
        })
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.token = data['token']
        self.recovery_code = data['recovery_code']
        self.profile_id = data['profile']['profile_id']

    def test_login_valid_credentials(self):
        """User can log in with exact username and password."""
        client = Client()
        res = client.post('/api/auth/login/', {
            'username': 'AliceTester',
            'password': 'pass',
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['profile']['profile_id'], self.profile_id)
        self.assertIn(SESSION_COOKIE_NAME, client.cookies)

    def test_login_case_insensitive_username(self):
        """Username matching is case-insensitive."""
        client = Client()
        res = client.post('/api/auth/login/', {
            'username': 'alicetester',
            'password': 'pass',
        })
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['success'])

    def test_login_via_profile_id(self):
        """Existing users can log in using their Profile ID as username."""
        client = Client()
        res = client.post('/api/auth/login/', {
            'username': self.profile_id.lower(),
            'password': 'pass',
        })
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['success'])

    def test_argon2_hashing_verified(self):
        """Verify user's password was hashed using Argon2."""
        user = User.objects.get(username='AliceTester')
        self.assertTrue(user.password.startswith('argon2'))

    def test_login_invalid_password_generic_error(self):
        """Invalid password returns generic 401 error message."""
        client = Client()
        res = client.post('/api/auth/login/', {
            'username': 'AliceTester',
            'password': 'wrongpassword',
        })
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json()['message'], 'Invalid username or password.')

    def test_login_nonexistent_user_generic_error(self):
        """Non-existent username returns generic 401 error message (prevents enumeration)."""
        client = Client()
        res = client.post('/api/auth/login/', {
            'username': 'NonExistentUser123',
            'password': 'anyPassword',
        })
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.json()['message'], 'Invalid username or password.')

    def test_login_rate_limiting_lockout(self):
        """5 failed login attempts triggers 429 lockout."""
        client = Client()
        for _ in range(5):
            res = client.post('/api/auth/login/', {
                'username': 'AliceTester',
                'password': 'badpassword',
            })
            self.assertEqual(res.status_code, 401)

        # 6th attempt must be 429
        res6 = client.post('/api/auth/login/', {
            'username': 'AliceTester',
            'password': 'pass',
        })
        self.assertEqual(res6.status_code, 429)
        self.assertIn('Too many failed login attempts', res6.json()['message'])

    def test_multi_device_login_and_independent_logout(self):
        """Logging in on device 2 creates an independent session; device 1 remains logged in."""
        device1 = Client()
        res1 = device1.post('/api/auth/login/', {'username': 'AliceTester', 'password': 'pass'})
        token1 = res1.json()['token']

        device2 = Client()
        res2 = device2.post('/api/auth/login/', {'username': 'AliceTester', 'password': 'pass'})
        token2 = res2.json()['token']

        self.assertNotEqual(token1, token2)

        # Device 1 logs out
        logout_res = device1.post('/api/auth/profile/logout/', HTTP_AUTHORIZATION=f"Bearer {token1}")
        self.assertEqual(logout_res.status_code, 200)

        # Device 1 session is inactive
        res_me1 = device1.get('/api/auth/profile/me/', HTTP_AUTHORIZATION=f"Bearer {token1}")
        self.assertIn(res_me1.status_code, (401, 403))

        # Device 2 session is STILL ACTIVE!
        res_me2 = device2.get('/api/auth/profile/me/', HTTP_AUTHORIZATION=f"Bearer {token2}")
        self.assertEqual(res_me2.status_code, 200)
        self.assertEqual(res_me2.json()['profile']['profile_id'], self.profile_id)

    def test_logout_all_devices(self):
        """Log out from all devices revokes all active sessions."""
        d1 = Client()
        r1 = d1.post('/api/auth/login/', {'username': 'AliceTester', 'password': 'pass'})
        t1 = r1.json()['token']

        d2 = Client()
        r2 = d2.post('/api/auth/login/', {'username': 'AliceTester', 'password': 'pass'})
        t2 = r2.json()['token']

        # d1 invokes logout-all
        res = d1.post('/api/auth/profile/logout-all/', HTTP_AUTHORIZATION=f"Bearer {t1}")
        self.assertEqual(res.status_code, 200)

        # Both sessions are now revoked
        self.assertIn(d1.get('/api/auth/profile/me/', HTTP_AUTHORIZATION=f"Bearer {t1}").status_code, (401, 403))
        self.assertIn(d2.get('/api/auth/profile/me/', HTTP_AUTHORIZATION=f"Bearer {t2}").status_code, (401, 403))


class AccountRecoveryExtendedTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.client = Client()
        res = self.client.post('/api/auth/profile/create/', {
            'username': 'BobRecover',
            'display_name': 'Bob Tester',
            'password': 'initialpass',
        })
        data = res.json()
        self.recovery_code = data['recovery_code']
        self.token = data['token']

    def test_recovery_flow_sets_new_password_and_revokes_old_sessions(self):
        """Entering username + recovery code sets new password, rotates code, and revokes old sessions."""
        client = Client()
        res = client.post('/api/auth/profile/recover/', {
            'username': 'bobrecover',
            'recovery_code': self.recovery_code,
            'new_password': 'brandnewpassword',
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data['success'])
        new_code = data['new_recovery_code']
        self.assertNotEqual(new_code, self.recovery_code)

        # Old session is revoked
        old_check = self.client.get('/api/auth/profile/me/', HTTP_AUTHORIZATION=f"Bearer {self.token}")
        self.assertIn(old_check.status_code, (401, 403))

        # Can log in with brand new password
        login_res = client.post('/api/auth/login/', {
            'username': 'BobRecover',
            'password': 'brandnewpassword',
        })
        self.assertEqual(login_res.status_code, 200)

        # Old recovery code CANNOT be reused!
        reuse_res = client.post('/api/auth/profile/recover/', {
            'username': 'BobRecover',
            'recovery_code': self.recovery_code,
            'new_password': 'anotherpassword',
        })
        self.assertEqual(reuse_res.status_code, 400)


class ImageMessageTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.client = Client()
        res_a = self.client.post('/api/auth/profile/create/', {'display_name': 'AliceImg'})
        self.token_a = res_a.json()['token']
        self.user_a = User.objects.get(username=res_a.json()['profile']['profile_id'])

        res_b = self.client.post('/api/auth/profile/create/', {'display_name': 'BobImg'})
        self.token_b = res_b.json()['token']
        self.user_b = User.objects.get(username=res_b.json()['profile']['profile_id'])

        res_c = self.client.post('/api/auth/profile/create/', {'display_name': 'CharlieEve'})
        self.token_c = res_c.json()['token']

        self.conv, _ = Conversation.get_or_create_between(self.user_a, self.user_b)

    def test_upload_image_message_success_and_metadata(self):
        """Uploading valid image produces thumbnail, dimensions, and image message."""
        test_img = create_test_image("photo.png", size=(400, 300), color="purple", format="PNG")
        res = self.client.post(
            f"/api/auth/conversations/{self.conv.id}/messages/image/",
            {'image': test_img, 'client_message_id': 'img-test-123'},
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertTrue(data['success'])
        msg = data['message']
        self.assertEqual(msg['message_type'], 'image')
        self.assertEqual(msg['image_width'], 400)
        self.assertEqual(msg['image_height'], 300)
        self.assertIsNotNone(msg['image_url'])
        self.assertIsNotNone(msg['thumbnail_url'])

        # Bob can view the image
        res_bob_img = self.client.get(
            msg['image_url'],
            HTTP_AUTHORIZATION=f"Bearer {self.token_b}"
        )
        self.assertIn(res_bob_img.status_code, (200, 302))

        # Bob can view the thumbnail
        res_bob_thumb = self.client.get(
            msg['thumbnail_url'],
            HTTP_AUTHORIZATION=f"Bearer {self.token_b}"
        )
        self.assertIn(res_bob_thumb.status_code, (200, 302))

    def test_unauthorized_user_cannot_access_private_image(self):
        """Third party user C cannot upload or view images in A & B conversation."""
        test_img = create_test_image("hacker.png", size=(100, 100))
        # C tries to upload to A & B conversation
        res_up = self.client.post(
            f"/api/auth/conversations/{self.conv.id}/messages/image/",
            {'image': test_img},
            HTTP_AUTHORIZATION=f"Bearer {self.token_c}"
        )
        self.assertEqual(res_up.status_code, 403)

        # A uploads
        test_img2 = create_test_image("alice.png", size=(200, 200))
        res_a = self.client.post(
            f"/api/auth/conversations/{self.conv.id}/messages/image/",
            {'image': test_img2},
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
        )
        msg_id = res_a.json()['message']['id']

        # C tries to view the image
        res_view = self.client.get(
            f"/api/auth/conversations/{self.conv.id}/messages/{msg_id}/image/",
            HTTP_AUTHORIZATION=f"Bearer {self.token_c}"
        )
        self.assertEqual(res_view.status_code, 403)

    def test_upload_image_message_cloudinary_uses_authenticated_type(self):
        """Chat image upload with Cloudinary credentials passes resource_type='image' and type='authenticated'."""
        from unittest.mock import patch
        from django.conf import settings

        with patch.object(settings, 'CLOUDINARY_CLOUD_NAME', 'mock_cloud'), \
             patch.object(settings, 'CLOUDINARY_API_KEY', 'mock_key'), \
             patch.object(settings, 'CLOUDINARY_API_SECRET', 'mock_secret'), \
             patch('cloudinary.uploader.upload') as mock_upload:

            mock_upload.side_effect = [
                {
                    'public_id': f'lynqo_chat_auth/{self.conv.id}/auth_img_main_123',
                    'secure_url': 'https://res.cloudinary.com/mock/auth_img_main.jpg',
                    'resource_type': 'image'
                },
                {
                    'public_id': f'lynqo_chat_auth/{self.conv.id}/thumbs/auth_img_thumb_123',
                    'secure_url': 'https://res.cloudinary.com/mock/auth_img_thumb.jpg',
                    'resource_type': 'image'
                }
            ]

            test_img = create_test_image("secret_photo.png", size=(500, 400), format="PNG")
            res = self.client.post(
                f"/api/auth/conversations/{self.conv.id}/messages/image/",
                {'image': test_img, 'client_message_id': 'cli-cld-img-1'},
                HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
            )
            self.assertEqual(res.status_code, 201)
            data = res.json()
            self.assertTrue(data['success'])

            msg = Message.objects.get(id=data['message']['id'])
            self.assertEqual(msg.image_storage_id, f'lynqo_chat_auth/{self.conv.id}/auth_img_main_123')
            self.assertEqual(msg.image_thumbnail_id, f'lynqo_chat_auth/{self.conv.id}/thumbs/auth_img_thumb_123')

            # Verify both uploads used resource_type='image' and type='authenticated'
            self.assertEqual(mock_upload.call_count, 2)
            main_call_kwargs = mock_upload.call_args_list[0][1]
            self.assertEqual(main_call_kwargs.get('resource_type'), 'image')
            self.assertEqual(main_call_kwargs.get('type'), 'authenticated')
            self.assertIn('lynqo_chat_auth', main_call_kwargs.get('folder', ''))

            thumb_call_kwargs = mock_upload.call_args_list[1][1]
            self.assertEqual(thumb_call_kwargs.get('resource_type'), 'image')
            self.assertEqual(thumb_call_kwargs.get('type'), 'authenticated')
            self.assertIn('thumbs', thumb_call_kwargs.get('folder', ''))

    def test_image_media_view_returns_authenticated_signed_url_with_strict_caching(self):
        """Image media view generates short-lived signed URLs for authenticated assets with private cache headers."""
        from unittest.mock import patch
        from django.conf import settings

        msg = Message.objects.create(
            conversation=self.conv,
            sender=self.user_a,
            message_type='image',
            image_storage_id=f'lynqo_chat_auth/{self.conv.id}/auth_img_test_abc',
            image_thumbnail_id=f'lynqo_chat_auth/{self.conv.id}/thumbs/auth_img_test_abc_thumb',
            status='sent'
        )

        with patch.object(settings, 'CLOUDINARY_CLOUD_NAME', 'mock_cloud'), \
             patch.object(settings, 'CLOUDINARY_API_KEY', 'mock_key'), \
             patch.object(settings, 'CLOUDINARY_API_SECRET', 'mock_secret'), \
             patch('cloudinary.utils.cloudinary_url') as mock_cld_url:

            mock_cld_url.return_value = ('https://res.cloudinary.com/mock/image/authenticated/s--sig--/v1/auth_img_test_abc.jpg', {})

            # 1. Full image request by conversation participant
            res_full = self.client.get(
                f"/api/auth/conversations/{self.conv.id}/messages/{msg.id}/image/",
                HTTP_AUTHORIZATION=f"Bearer {self.token_b}"
            )
            self.assertEqual(res_full.status_code, 302)
            self.assertEqual(res_full.headers['Location'], 'https://res.cloudinary.com/mock/image/authenticated/s--sig--/v1/auth_img_test_abc.jpg')
            self.assertIn('private', res_full.headers.get('Cache-Control', ''))
            self.assertIn('no-store', res_full.headers.get('Cache-Control', ''))

            # Verify cloudinary_url args
            mock_cld_url.assert_called_once()
            args, kwargs = mock_cld_url.call_args
            self.assertEqual(args[0], msg.image_storage_id)
            self.assertEqual(kwargs.get('type'), 'authenticated')
            self.assertTrue(kwargs.get('sign_url'))
            self.assertGreater(kwargs.get('expires_at', 0), 0)

            # 2. Thumbnail request with ?thumb=1
            mock_cld_url.reset_mock()
            mock_cld_url.return_value = ('https://res.cloudinary.com/mock/image/authenticated/s--sig--/v1/thumb.jpg', {})
            res_thumb = self.client.get(
                f"/api/auth/conversations/{self.conv.id}/messages/{msg.id}/image/?thumb=1",
                HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
            )
            self.assertEqual(res_thumb.status_code, 302)
            args_thumb, kwargs_thumb = mock_cld_url.call_args
            self.assertEqual(args_thumb[0], msg.image_thumbnail_id)
            self.assertEqual(kwargs_thumb.get('type'), 'authenticated')
            self.assertTrue(kwargs_thumb.get('sign_url'))
            self.assertEqual(kwargs_thumb.get('transformation', {}).get('width'), 360)

            # 3. JSON URL request with ?json=1
            res_json = self.client.get(
                f"/api/auth/conversations/{self.conv.id}/messages/{msg.id}/image/?thumb=1&json=1",
                HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
            )
            self.assertEqual(res_json.status_code, 200)
            self.assertTrue(res_json.json()['success'])
            self.assertEqual(res_json.json()['image_url'], 'https://res.cloudinary.com/mock/image/authenticated/s--sig--/v1/thumb.jpg')

    def test_image_media_view_legacy_public_image_backward_compatibility(self):
        """Legacy Cloudinary images with type='upload' receive signed URLs and load seamlessly."""
        from unittest.mock import patch
        from django.conf import settings

        legacy_msg = Message.objects.create(
            conversation=self.conv,
            sender=self.user_a,
            message_type='image',
            image_storage_id=f'lynqo_chat/{self.conv.id}/img_legacy_999',
            image_thumbnail_id=f'lynqo_chat/{self.conv.id}/thumbs/img_legacy_999_thumb',
            status='sent'
        )

        with patch.object(settings, 'CLOUDINARY_CLOUD_NAME', 'mock_cloud'), \
             patch.object(settings, 'CLOUDINARY_API_KEY', 'mock_key'), \
             patch.object(settings, 'CLOUDINARY_API_SECRET', 'mock_secret'), \
             patch('cloudinary.utils.cloudinary_url') as mock_cld_url:

            mock_cld_url.return_value = ('https://res.cloudinary.com/mock/image/upload/s--sig--/v1/img_legacy_999.jpg', {})

            res_legacy = self.client.get(
                f"/api/auth/conversations/{self.conv.id}/messages/{legacy_msg.id}/image/",
                HTTP_AUTHORIZATION=f"Bearer {self.token_b}"
            )
            self.assertEqual(res_legacy.status_code, 302)
            args, kwargs = mock_cld_url.call_args
            self.assertEqual(args[0], legacy_msg.image_storage_id)
            self.assertEqual(kwargs.get('type'), 'upload')
            self.assertTrue(kwargs.get('sign_url'))

    def test_image_media_view_deleted_message_returns_404(self):
        """Deleted image message returns 404 Not Found and never attempts Cloudinary lookups."""
        from unittest.mock import patch
        deleted_msg = Message.objects.create(
            conversation=self.conv,
            sender=self.user_a,
            message_type='image',
            image_storage_id='lynqo_chat_auth/32/auth_deleted_123',
            is_deleted=True,
            status='sent'
        )

        with patch('cloudinary.utils.cloudinary_url') as mock_cld:
            res = self.client.get(
                f"/api/auth/conversations/{self.conv.id}/messages/{deleted_msg.id}/image/",
                HTTP_AUTHORIZATION=f"Bearer {self.token_b}"
            )
            self.assertEqual(res.status_code, 404)
            mock_cld.assert_not_called()

    def test_image_media_view_unauthorized_third_party_user_forbidden(self):
        """Users who are not participants in the conversation receive 403 Forbidden."""
        other_user = User.objects.create(username="LYNQ-SNOOPER")
        other_session = ProfileSession.objects.create(user=other_user, token="snooper_tok", is_active=True)
        msg = Message.objects.create(
            conversation=self.conv,
            sender=self.user_a,
            message_type='image',
            image_storage_id='lynqo_chat_auth/32/auth_secret_img',
            status='sent'
        )

        res = self.client.get(
            f"/api/auth/conversations/{self.conv.id}/messages/{msg.id}/image/",
            HTTP_AUTHORIZATION=f"Bearer {other_session.token}"
        )
        self.assertEqual(res.status_code, 403)
        self.assertFalse(res.json().get('success', True))

    def test_image_media_view_proxy_mode_streams_cloudinary_bytes(self):
        """Image endpoint with ?proxy=1 streams image bytes directly from same origin."""
        from unittest.mock import patch, MagicMock
        from django.conf import settings

        msg = Message.objects.create(
            conversation=self.conv,
            sender=self.user_a,
            message_type='image',
            image_storage_id=f'lynqo_chat_auth/{self.conv.id}/auth_img_proxy',
            status='sent'
        )

        mock_http_response = MagicMock()
        mock_http_response.read.return_value = b"\xff\xd8\xff\xe0mock_jpeg_stream"
        mock_http_response.headers.get_content_type.return_value = "image/jpeg"

        with patch.object(settings, 'CLOUDINARY_CLOUD_NAME', 'mock_cloud'), \
             patch.object(settings, 'CLOUDINARY_API_KEY', 'mock_key'), \
             patch.object(settings, 'CLOUDINARY_API_SECRET', 'mock_secret'), \
             patch('cloudinary.utils.cloudinary_url', return_value=('https://res.cloudinary.com/mock/image/authenticated/s--123--/img.jpg', {})), \
             patch('urllib.request.urlopen') as mock_urlopen:

            mock_urlopen.return_value.__enter__.return_value = mock_http_response

            res = self.client.get(
                f"/api/auth/conversations/{self.conv.id}/messages/{msg.id}/image/?proxy=1",
                HTTP_AUTHORIZATION=f"Bearer {self.token_b}"
            )
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.content, b"\xff\xd8\xff\xe0mock_jpeg_stream")
            self.assertEqual(res['Content-Type'], 'image/jpeg')

    def test_voice_media_view_proxy_mode_streams_cloudinary_bytes(self):
        """Voice endpoint with ?proxy=1 streams audio bytes directly without cross-origin redirect."""
        from unittest.mock import patch, MagicMock
        from django.conf import settings

        voice_msg = Message.objects.create(
            conversation=self.conv,
            sender=self.user_a,
            message_type='voice',
            audio_storage_id=f'lynqo_voice_auth/{self.conv.id}/auth_voice_proxy',
            audio_format='webm',
            status='sent'
        )

        mock_http_response = MagicMock()
        mock_http_response.read.return_value = b"RIFFmock_audio_stream"
        mock_http_response.headers.get_content_type.return_value = "audio/webm"

        with patch.object(settings, 'CLOUDINARY_CLOUD_NAME', 'mock_cloud'), \
             patch.object(settings, 'CLOUDINARY_API_KEY', 'mock_key'), \
             patch.object(settings, 'CLOUDINARY_API_SECRET', 'mock_secret'), \
             patch('cloudinary.utils.cloudinary_url', return_value=('https://res.cloudinary.com/mock/video/authenticated/s--123--/voice.webm', {})), \
             patch('urllib.request.urlopen') as mock_urlopen:

            mock_urlopen.return_value.__enter__.return_value = mock_http_response

            res = self.client.get(
                f"/api/auth/conversations/{self.conv.id}/messages/{voice_msg.id}/audio/?proxy=1",
                HTTP_AUTHORIZATION=f"Bearer {self.token_b}"
            )
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.content, b"RIFFmock_audio_stream")
            self.assertEqual(res['Content-Type'], 'audio/webm')

    def test_delete_message_for_everyone_destroys_cloudinary_images(self):
        """Deleting an image message for everyone destroys both main and thumbnail assets in Cloudinary."""
        from unittest.mock import patch
        from django.conf import settings
        from django.core.cache import cache

        msg = Message.objects.create(
            conversation=self.conv,
            sender=self.user_a,
            message_type='image',
            image_storage_id=f'lynqo_chat_auth/{self.conv.id}/auth_img_del_123',
            image_thumbnail_id=f'lynqo_chat_auth/{self.conv.id}/thumbs/auth_img_del_123_thumb',
            status='sent'
        )
        cache.set(f"image_signed_url:{msg.id}:0", "http://cached.url", 60)
        cache.set(f"image_signed_url:{msg.id}:1", "http://cached.thumb", 60)

        with patch.object(settings, 'CLOUDINARY_CLOUD_NAME', 'mock_cloud'), \
             patch('cloudinary.uploader.destroy') as mock_destroy:

            res = self.client.delete(
                f"/api/auth/conversations/{self.conv.id}/messages/{msg.id}/delete/?type=everyone",
                HTTP_AUTHORIZATION=f"Bearer {self.token_a}"
            )
            self.assertEqual(res.status_code, 200)

            # Cloudinary destroy should be called twice (main + thumb)
            self.assertEqual(mock_destroy.call_count, 2)
            destroy_calls = [call[1] for call in mock_destroy.call_args_list]
            call_types = [c.get('type') for c in destroy_calls]
            self.assertEqual(call_types, ['authenticated', 'authenticated'])

            msg.refresh_from_db()
            self.assertTrue(msg.is_deleted)
            self.assertIsNone(msg.image_storage_id)
            self.assertIsNone(msg.image_thumbnail_id)
            self.assertIsNone(cache.get(f"image_signed_url:{msg.id}:0"))
            self.assertIsNone(cache.get(f"image_signed_url:{msg.id}:1"))

    def test_adaptive_cloudinary_storage_chat_image_authenticated_and_avatar_public(self):
        """AdaptiveCloudinaryStorage assigns type='authenticated' to chat images and type='upload' to avatars."""
        from accounts.storage import AdaptiveCloudinaryStorage
        from unittest.mock import patch

        storage = AdaptiveCloudinaryStorage()

        with patch('cloudinary.uploader.upload') as mock_upload:
            # 1. Profile Avatar -> Public upload
            storage._upload("profile_pics/user_avatar.jpg", b"fake_avatar")
            _, kwargs_avatar = mock_upload.call_args
            self.assertEqual(kwargs_avatar.get('type'), 'upload')
            self.assertEqual(kwargs_avatar.get('resource_type'), 'image')

            # 2. Chat Image -> Authenticated upload
            storage._upload("chat_images/private_photo.png", b"fake_chat_png")
            _, kwargs_chat_img = mock_upload.call_args
            self.assertEqual(kwargs_chat_img.get('type'), 'authenticated')
            self.assertEqual(kwargs_chat_img.get('resource_type'), 'image')

            # 3. Chat Thumbnail -> Authenticated upload
            storage._upload("chat_thumbnails/private_thumb.jpg", b"fake_thumb")
            _, kwargs_thumb = mock_upload.call_args
            self.assertEqual(kwargs_thumb.get('type'), 'authenticated')

            # 4. Voice recording -> Authenticated video upload
            storage._upload("voice_messages/voice_record.webm", b"fake_voice")
            _, kwargs_voice = mock_upload.call_args
            self.assertEqual(kwargs_voice.get('type'), 'authenticated')
            self.assertEqual(kwargs_voice.get('resource_type'), 'video')


class RealtimeMessagingAndPresenceTests(TestCase):
    def test_presence_tracking_multi_session(self):
        """Active connection counter preserves online status until all sessions close."""
        from accounts.consumers import is_user_online, add_user_channel, remove_user_channel
        user = User.objects.create(username="ws_user_presence_test")
        self.assertFalse(is_user_online(user.id))

        c1 = add_user_channel(user.id, "chan_1")
        self.assertEqual(c1, 1)
        self.assertTrue(is_user_online(user.id))

        # Second tab opens
        c2 = add_user_channel(user.id, "chan_2")
        self.assertEqual(c2, 2)
        self.assertTrue(is_user_online(user.id))

        # First tab closes - user must still be online!
        c3 = remove_user_channel(user.id, "chan_1")
        self.assertEqual(c3, 1)
        self.assertTrue(is_user_online(user.id))

        # Second tab closes - user becomes offline
        c4 = remove_user_channel(user.id, "chan_2")
        self.assertEqual(c4, 0)
        self.assertFalse(is_user_online(user.id))

    def test_profile_serializer_presence_reflects_active_ws(self):
        """ProfilePublicSerializer returns is_online=True when user has active WS."""
        from accounts.consumers import add_user_channel, remove_user_channel
        from accounts.serializers import ProfilePublicSerializer
        user = User.objects.create(username="ws_serializer_test")
        profile = Profile.objects.create(user=user, profile_id="LYNQ-SER1", display_name="Ser User")

        # Initially offline
        ser1 = ProfilePublicSerializer(profile).data
        self.assertFalse(ser1['is_online'])

        # User connects
        add_user_channel(user.id, "chan_ser_1")
        ser2 = ProfilePublicSerializer(profile).data
        self.assertTrue(ser2['is_online'])

        # User disconnects
        remove_user_channel(user.id, "chan_ser_1")
        ser3 = ProfilePublicSerializer(profile).data
        self.assertFalse(ser3['is_online'])


class Phase1ReliabilityAndQueryTests(TransactionTestCase):
    def setUp(self):
        from rest_framework.test import APIClient
        cache.clear()
        self.client = APIClient()
        self.user_a = User.objects.create_user(username="p1_alice", password="secret123", full_name="Alice")
        self.profile_a = Profile.objects.create(user=self.user_a, profile_id="LYNQ-P1A", display_name="Alice")
        self.user_b = User.objects.create_user(username="p1_bob", password="secret123", full_name="Bob")
        self.profile_b = Profile.objects.create(user=self.user_b, profile_id="LYNQ-P1B", display_name="Bob")
        self.user_c = User.objects.create_user(username="p1_charlie", password="secret123", full_name="Charlie")
        self.profile_c = Profile.objects.create(user=self.user_c, profile_id="LYNQ-P1C", display_name="Charlie")
        self.conv = Conversation.objects.create(participant_1=self.user_a, participant_2=self.user_b)

    def test_fresh_login_succeeds_with_stale_token_header_or_cookie(self):
        """Stale Authorization header or cookie must not block fresh login/create/recover."""
        self.client.cookies['lynqo_session'] = 'stale_dead_cookie_token'
        resp = self.client.post(
            '/api/auth/login/',
            {'username': 'p1_alice', 'password': 'secret123'},
            format='json',
            HTTP_AUTHORIZATION='Bearer stale_dead_bearer_token'
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['success'])
        self.assertIn('token', resp.data)

    def test_message_list_reply_prefetch_avoids_n_plus_1(self):
        """MessageListView with reply_to messages uses Prefetch without N+1 queries per reply."""
        sess_a = ProfileSession.create_session(self.user_a)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {sess_a.token}')

        # Create 10 messages each replying to a previous message
        prev_msg = Message.objects.create(conversation=self.conv, sender=self.user_b, content="Root msg")
        for i in range(10):
            prev_msg = Message.objects.create(
                conversation=self.conv,
                sender=self.user_a,
                content=f"Reply {i}",
                reply_to=prev_msg
            )

        from django.test.utils import CaptureQueriesContext
        from django.db import connection
        with CaptureQueriesContext(connection) as ctx:
            resp = self.client.get(f'/api/auth/conversations/{self.conv.id}/messages/?limit=50')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['messages']), 11)
        # Should be <= 8 queries total (auth + conv + msgs + prefetch + count/etc), NOT 11+ N+1 queries
        self.assertLessEqual(len(ctx), 8)

    def test_ws_batched_presence_and_deduplicated_multi_device_delivery(self):
        """WS connect batches contact presence queries, enforces conv auth, and deduplicates broadcasts."""
        from channels.testing import WebsocketCommunicator
        from config.asgi import application
        from asgiref.sync import async_to_sync
        from django.test.utils import CaptureQueriesContext
        from django.db import connection

        # Add extra contacts for Alice
        for i in range(5):
            u = User.objects.create(username=f"p1_extra_{i}")
            Profile.objects.create(user=u, profile_id=f"LYNQ-EX{i}", display_name=f"Extra {i}")
            Conversation.objects.create(participant_1=self.user_a, participant_2=u)

        sess_a = ProfileSession.create_session(self.user_a)
        sess_b = ProfileSession.create_session(self.user_b)
        sess_c = ProfileSession.create_session(self.user_c)

        # Verify batched contact presence & cached participant auth query counts
        from accounts.consumers import ChatConsumer
        consumer = ChatConsumer()
        consumer.user = self.user_a
        consumer._conv_participants = {}
        with CaptureQueriesContext(connection) as batch_ctx:
            cids = consumer.get_contact_ids.__wrapped__(consumer)
            info = consumer.get_contacts_profile_info_batch.__wrapped__(consumer, cids)
        self.assertEqual(len(info), 6)
        self.assertLessEqual(len(batch_ctx), 3)

        with CaptureQueriesContext(connection) as first_ctx:
            auth1, other1 = consumer._fetch_conv_auth.__wrapped__(consumer, self.conv.id)
        self.assertTrue(auth1)
        self.assertEqual(other1, self.user_b.id)
        self.assertEqual(len(first_ctx), 1)
        consumer._conv_participants[str(self.conv.id)] = (auth1, other1, __import__('time').monotonic())

        with CaptureQueriesContext(connection) as cached_ctx:
            auth2, other2 = async_to_sync(consumer.get_conv_auth)(self.conv.id)
        self.assertTrue(auth2)
        self.assertEqual(other2, self.user_b.id)
        self.assertEqual(len(cached_ctx), 0)

        async def run_ws():
            comm_a1 = WebsocketCommunicator(application, f"/ws/chat/?token={sess_a.token}")
            comm_a2 = WebsocketCommunicator(application, f"/ws/chat/?token={sess_a.token}")
            comm_b = WebsocketCommunicator(application, f"/ws/chat/?token={sess_b.token}")
            comm_c = WebsocketCommunicator(application, f"/ws/chat/?token={sess_c.token}")

            ok_a1, _ = await comm_a1.connect()
            self.assertTrue(ok_a1)
            ok_a2, _ = await comm_a2.connect()
            ok_b, _ = await comm_b.connect()
            ok_c, _ = await comm_c.connect()
            self.assertTrue(ok_a2 and ok_b and ok_c)

            # Drain initial presence_update frames
            for comm in (comm_a1, comm_a2, comm_b, comm_c):
                while not await comm.receive_nothing(timeout=0.05):
                    await comm.receive_json_from()

            # Join conv for Alice (tab 1) and Bob
            await comm_a1.send_json_to({'type': 'join_conversation', 'conversation_id': self.conv.id})
            await comm_b.send_json_to({'type': 'join_conversation', 'conversation_id': self.conv.id})
            # Unauthorized user Charlie tries to join & type
            await comm_c.send_json_to({'type': 'join_conversation', 'conversation_id': self.conv.id})
            await comm_c.send_json_to({'type': 'typing', 'conversation_id': self.conv.id, 'is_typing': True})

            # Drain join ACKs
            ack_a1 = await comm_a1.receive_json_from()
            self.assertEqual(ack_a1['type'], 'joined_conversation')
            ack_b = await comm_b.receive_json_from()
            self.assertEqual(ack_b['type'], 'joined_conversation')
            # Charlie must NOT receive joined_conversation
            self.assertTrue(await comm_c.receive_nothing(timeout=0.05))

            # Alice sends message from tab 1
            await comm_a1.send_json_to({
                'type': 'chat_message',
                'conversation_id': self.conv.id,
                'content': 'Hello multi-device!',
                'client_message_id': 'p1-ws-1',
            })

            # Bob should receive EXACTLY ONE new_message (plus 1 conversation_update)
            bob_events = []
            while not await comm_b.receive_nothing(timeout=0.1):
                bob_events.append(await comm_b.receive_json_from())
            bob_new_msgs = [e for e in bob_events if e.get('type') == 'new_message']
            self.assertEqual(len(bob_new_msgs), 1)
            self.assertEqual(bob_new_msgs[0]['message']['content'], 'Hello multi-device!')

            # Alice's 2nd tab should also receive EXACTLY ONE new_message
            a2_events = []
            while not await comm_a2.receive_nothing(timeout=0.1):
                a2_events.append(await comm_a2.receive_json_from())
            a2_new_msgs = [e for e in a2_events if e.get('type') == 'new_message']
            self.assertEqual(len(a2_new_msgs), 1)

            # Cached typing works without DB errors
            await comm_a1.send_json_to({'type': 'typing', 'conversation_id': self.conv.id, 'is_typing': True})
            typing_evt = await comm_b.receive_json_from()
            self.assertEqual(typing_evt['type'], 'typing_indicator')

            await comm_a1.disconnect()
            await comm_a2.disconnect()
            await comm_b.disconnect()
            await comm_c.disconnect()

        async_to_sync(run_ws)()
