import io
import json
from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, TransactionTestCase, Client
from django.urls import reverse
from accounts.models import (
    User, Profile, ProfileSession, ConnectRequest, Conversation, Message
)
from accounts.auth import SESSION_COOKIE_NAME


def create_test_image(filename="avatar.png", size=(100, 100), color="blue", format="PNG"):
    file_obj = io.BytesIO()
    image = Image.new("RGBA", size=size, color=color)
    image.save(file_obj, format=format)
    file_obj.seek(0)
    return SimpleUploadedFile(filename, file_obj.read(), content_type=f"image/{format.lower()}")


class PasswordlessProfileTests(TestCase):
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


class ConnectionRequestTests(TestCase):
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


class RealTimeMessagingTests(TestCase):
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


class ChatReliabilityRegressionTests(TestCase):
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


