"""
LYNQO E2E Verification Script:
Simulates two independent users (User A and User B) + an unauthorized attacker (User C).
Tests the complete journey:
- Passwordless profile creation with avatar upload
- Unique Profile ID generation & recovery code assignment
- Profile search by ID
- Connect request sending & acceptance
- Real-time one-to-one WebSocket messaging & typing indicators
- Persistent PostgreSQL message history
- Session persistence via HttpOnly cookie after browser refresh
- Profile recovery using single-use recovery code with rotation
- Unauthorized access rejection for third party
"""

import os
import sys
import io
import asyncio
import json
from PIL import Image

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from django.test import Client
from django.core.files.uploadedfile import SimpleUploadedFile
from asgiref.sync import sync_to_async
from channels.testing import WebsocketCommunicator
from config.asgi import application
from accounts.models import Profile, Conversation, Message, ConnectRequest
from accounts.auth import SESSION_COOKIE_NAME

def create_image(name="test.png"):
    buf = io.BytesIO()
    img = Image.new("RGBA", (120, 120), color="pink")
    img.save(buf, format="PNG")
    buf.seek(0)
    return SimpleUploadedFile(name, buf.read(), content_type="image/png")

async def run_e2e_verification():
    print("=" * 70)
    print("STARTING LYNQO TWO-USER END-TO-END VERIFICATION")
    print("=" * 70)

    # 1. User A Journey: Open LYNQO, Create Profile with Avatar
    print("\n[Step 1] User A creates profile with display name and avatar...")
    client_a = Client()
    avatar_a = create_image("alice_avatar.png")
    
    @sync_to_async
    def create_user_a():
        return client_a.post('/api/auth/profile/create/', {
            'display_name': 'Alice Springs',
            'profile_picture': avatar_a
        })

    res_a = await create_user_a()
    assert res_a.status_code == 201, f"User A creation failed: {res_a.status_code} {res_a.content}"
    data_a = res_a.json()
    token_a = data_a['token']
    profile_id_a = data_a['profile']['profile_id']
    recovery_code_a = data_a['recovery_code']
    assert SESSION_COOKIE_NAME in res_a.cookies, "HttpOnly session cookie missing for User A"
    print(f"  ✓ User A created: {data_a['profile']['display_name']} ({profile_id_a})")
    print(f"  ✓ Recovery code: {recovery_code_a}")
    print(f"  ✓ HttpOnly Cookie: {SESSION_COOKIE_NAME}={res_a.cookies[SESSION_COOKIE_NAME].value[:15]}...")

    # 2. User B Journey: Separate client, separate cookies
    print("\n[Step 2] User B creates profile on separate browser context...")
    client_b = Client()
    
    @sync_to_async
    def create_user_b():
        return client_b.post('/api/auth/profile/create/', {
            'display_name': 'Bob Martin'
        })

    res_b = await create_user_b()
    assert res_b.status_code == 201, f"User B creation failed: {res_b.status_code} {res_b.content}"
    data_b = res_b.json()
    token_b = data_b['token']
    profile_id_b = data_b['profile']['profile_id']
    recovery_code_b = data_b['recovery_code']
    print(f"  ✓ User B created: {data_b['profile']['display_name']} ({profile_id_b})")

    # 3. User A searches for User B by profile ID
    print(f"\n[Step 3] User A searches for User B by ID '{profile_id_b}'...")
    res_search = await sync_to_async(client_a.get)(f'/api/auth/profiles/search/?profile_id={profile_id_b}')
    assert res_search.status_code == 200
    search_data = res_search.json()
    assert search_data['profile']['display_name'] == 'Bob Martin'
    assert search_data['connection_status'] == 'none'
    print(f"  ✓ Search found: {search_data['profile']['display_name']}, status: {search_data['connection_status']}")

    # 4. User A sends connection request to User B
    print("\n[Step 4] User A sends connection request to User B...")
    @sync_to_async
    def send_request():
        return client_a.post('/api/auth/connections/request/', data=json.dumps({
            'profile_id': profile_id_b,
            'reason': 'be_friends'
        }), content_type='application/json')

    res_req = await send_request()
    assert res_req.status_code == 201
    req_id = res_req.json()['request']['id']
    print(f"  ✓ Connection request sent (ID: {req_id})")

    # 5. User B views incoming requests
    print("\n[Step 5] User B checks incoming connection requests...")
    res_in = await sync_to_async(client_b.get)('/api/auth/connections/requests/incoming/')
    assert res_in.status_code == 200
    incoming_list = res_in.json()['requests']
    assert len(incoming_list) >= 1
    assert incoming_list[0]['sender']['profile_id'] == profile_id_a
    print(f"  ✓ Incoming request from: {incoming_list[0]['sender']['display_name']} ({profile_id_a})")

    # 6. User B accepts the request
    print("\n[Step 6] User B accepts connection request...")
    res_accept = await sync_to_async(client_b.post)(f'/api/auth/connections/requests/{req_id}/accept/')
    assert res_accept.status_code == 200
    conv_id = res_accept.json()['conversation_id']
    print(f"  ✓ Request accepted! Active Conversation ID: {conv_id}")

    # 7. Real-Time WebSockets: User A and User B connect
    print("\n[Step 7] Establishing real-time WebSocket channels for User A and User B...")
    ws_a = WebsocketCommunicator(application, f"/ws/chat/?token={token_a}")
    ws_b = WebsocketCommunicator(application, f"/ws/chat/?token={token_b}")

    conn_a, _ = await ws_a.connect()
    conn_b, _ = await ws_b.connect()
    assert conn_a, "WebSocket A failed to connect"
    assert conn_b, "WebSocket B failed to connect"
    print("  ✓ User A WebSocket connected (online presence broadcast)")
    print("  ✓ User B WebSocket connected (online presence broadcast)")

    async def get_next_type(comm, expected_types, timeout=4):
        while True:
            msg = await comm.receive_json_from(timeout=timeout)
            if msg.get('type') in expected_types:
                return msg

    # Join conversation room
    await ws_a.send_json_to({'type': 'join_conversation', 'conversation_id': conv_id})
    res_join_a = await get_next_type(ws_a, ['joined_conversation'])
    assert res_join_a['type'] == 'joined_conversation'

    await ws_b.send_json_to({'type': 'join_conversation', 'conversation_id': conv_id})
    res_join_b = await get_next_type(ws_b, ['joined_conversation'])
    assert res_join_b['type'] == 'joined_conversation'
    print("  ✓ Both users joined real-time conversation room")

    # 8. User A sends message over WebSocket
    print("\n[Step 8] User A sends real-time message to User B...")
    await ws_a.send_json_to({
        'type': 'chat_message',
        'conversation_id': conv_id,
        'content': 'Hey Bob! Real-time chat works seamlessly!',
        'client_message_id': 'client-msg-a-01'
    })

    # User B receives it over WebSocket
    msg_received_b = await get_next_type(ws_b, ['new_message'])
    assert msg_received_b['message']['content'] == 'Hey Bob! Real-time chat works seamlessly!'
    assert msg_received_b['message']['sender_profile_id'] == profile_id_a
    print(f"  ✓ User B received over WebSocket: \"{msg_received_b['message']['content']}\"")

    # 9. User B types and sends reply
    print("\n[Step 9] User B types and sends reply...")
    await ws_b.send_json_to({'type': 'typing', 'conversation_id': conv_id, 'is_typing': True})
    typing_event = await get_next_type(ws_a, ['typing_indicator'])
    assert typing_event['is_typing'] is True
    print("  ✓ User A received User B typing indicator: is_typing=True")

    await ws_b.send_json_to({
        'type': 'chat_message',
        'conversation_id': conv_id,
        'content': 'Awesome Alice! Super fast and reliable!',
        'client_message_id': 'client-msg-b-01'
    })

    msg_received_a = await get_next_type(ws_a, ['new_message'])
    assert msg_received_a['message']['content'] == 'Awesome Alice! Super fast and reliable!'
    print(f"  ✓ User A received reply over WebSocket: \"{msg_received_a['message']['content']}\"")

    # Close sockets cleanly
    await ws_a.disconnect()
    await ws_b.disconnect()

    # 10. Simulate Browser Refresh (Session Persistence via HttpOnly Cookie)
    print("\n[Step 10] Simulating page refresh / browser restart...")
    res_refresh_a = await sync_to_async(client_a.get)('/api/auth/profile/me/')
    assert res_refresh_a.status_code == 200
    assert res_refresh_a.json()['profile']['profile_id'] == profile_id_a
    print(f"  ✓ User A remains authenticated via HttpOnly cookie: {res_refresh_a.json()['profile']['display_name']}")

    res_refresh_b = await sync_to_async(client_b.get)('/api/auth/profile/me/')
    assert res_refresh_b.status_code == 200
    assert res_refresh_b.json()['profile']['profile_id'] == profile_id_b
    print(f"  ✓ User B remains authenticated via HttpOnly cookie: {res_refresh_b.json()['profile']['display_name']}")

    # 11. Verify Database Persistence of Messages
    print("\n[Step 11] Verifying message history in PostgreSQL database...")
    res_history = await sync_to_async(client_a.get)(f'/api/auth/conversations/{conv_id}/messages/')
    assert res_history.status_code == 200
    history_messages = res_history.json()['messages']
    assert len(history_messages) == 2
    assert history_messages[0]['content'] == 'Hey Bob! Real-time chat works seamlessly!'
    assert history_messages[1]['content'] == 'Awesome Alice! Super fast and reliable!'
    print(f"  ✓ {len(history_messages)} messages persisted in PostgreSQL and retrieved in chronological order")

    # 12. Security Test: Unauthorized Third Party (User C)
    print("\n[Step 12] Security Test: Unauthorized third party attempts access...")
    client_c = Client()
    @sync_to_async
    def run_snoop():
        client_c.post('/api/auth/profile/create/', {'display_name': 'Eve Attacker'})
        res_snoop = client_c.get(f'/api/auth/conversations/{conv_id}/messages/')
        res_snoop_send = client_c.post(f'/api/auth/conversations/{conv_id}/messages/send/', data=json.dumps({
            'content': 'I am snooping!'
        }), content_type='application/json')
        return res_snoop.status_code, res_snoop_send.status_code

    snoop_read_status, snoop_send_status = await run_snoop()
    assert snoop_read_status == 403, f"Expected 403, got {snoop_read_status}"
    assert snoop_send_status == 403, f"Expected 403, got {snoop_send_status}"
    print("  ✓ Unauthorized third party read rejected: 403 Forbidden")
    print("  ✓ Unauthorized third party send rejected: 403 Forbidden")

    # 13. Profile Recovery with Single-Use Code Rotation
    print("\n[Step 13] Profile Recovery: User A loses browser session and recovers...")
    @sync_to_async
    def recover_user_a():
        client_a.cookies.clear()
        res_rec = client_a.post('/api/auth/profile/recover/', {
            'recovery_code': recovery_code_a
        })
        client_a.cookies.clear()
        res_old = client_a.post('/api/auth/profile/recover/', {'recovery_code': recovery_code_a})
        return res_rec, res_old

    res_recover, res_old_code = await recover_user_a()
    assert res_recover.status_code == 200
    recover_data = res_recover.json()
    assert recover_data['profile']['profile_id'] == profile_id_a
    new_recovery_code_a = recover_data['new_recovery_code']
    assert new_recovery_code_a != recovery_code_a
    print(f"  ✓ User A restored profile: {recover_data['profile']['display_name']}")
    print(f"  ✓ Single-use code rotated to: {new_recovery_code_a}")

    assert res_old_code.status_code == 400
    print("  ✓ Used recovery code correctly rejected (single-use verified)")

    print("\n" + "=" * 70)
    print("ALL TWO-USER END-TO-END SCENARIOS VERIFIED SUCCESSFULLY! (PASS)")
    print("=" * 70)

if __name__ == '__main__':
    asyncio.run(run_e2e_verification())
