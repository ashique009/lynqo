import os
import sys
import time
import json
import statistics
import asyncio
from io import BytesIO
import wave
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.test import Client
from django.db import connection, reset_queries
from django.conf import settings
from django.core.cache import cache
from channels.testing import WebsocketCommunicator
from config.asgi import application
from accounts.models import User, Profile, Conversation, Message, ProfileSession

def generate_pcm_audio():
    buf = BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(44100)
        wf.writeframes(b'\x00\x00' * 44100)
    buf.seek(0)
    buf.name = 'sample.wav'
    return buf

def percentile(data, p):
    if not data:
        return 0
    k = (len(data) - 1) * (p / 100.0)
    f = int(k)
    c = min(f + 1, len(data) - 1)
    d0 = data[f] * (c - k)
    d1 = data[c] * (k - f)
    return (d0 + d1)

def run_benchmarks():
    print("=" * 70)
    print("LYNQO PERFORMANCE BENCHMARK SUITE (20+ SAMPLES PER OPERATION)")
    print("=" * 70)

    # Disable throttling for benchmark profiling
    from rest_framework.settings import api_settings
    api_settings.DEFAULT_THROTTLE_RATES['user'] = '100000/min'
    api_settings.DEFAULT_THROTTLE_RATES['anon'] = '100000/min'

    # Setup 2 users with conversation and messages
    cache.clear()
    user_a, _ = User.objects.get_or_create(username='BENCH_A', defaults={'full_name': 'Bench Alice'})
    prof_a, _ = Profile.objects.get_or_create(user=user_a, defaults={'profile_id': 'LYNQ-BNCHA', 'display_name': 'Bench Alice'})
    sess_a, _ = ProfileSession.objects.get_or_create(token='token_bench_a_123', defaults={'user': user_a, 'is_active': True})

    user_b, _ = User.objects.get_or_create(username='BENCH_B', defaults={'full_name': 'Bench Bob'})
    prof_b, _ = Profile.objects.get_or_create(user=user_b, defaults={'profile_id': 'LYNQ-BNCHB', 'display_name': 'Bench Bob'})
    sess_b, _ = ProfileSession.objects.get_or_create(token='token_bench_b_123', defaults={'user': user_b, 'is_active': True})

    conv, _ = Conversation.get_or_create_between(user_a, user_b)

    # Populate 30 sample messages
    for i in range(30):
        Message.objects.get_or_create(
            conversation=conv,
            client_message_id=f'bench-seed-{i}',
            defaults={
                'sender': user_a if i % 2 == 0 else user_b,
                'content': f'Benchmark seed message {i}',
                'status': 'seen',
                'is_read': True,
            }
        )

    client_a = Client(HTTP_AUTHORIZATION='Bearer token_bench_a_123')
    client_b = Client(HTTP_AUTHORIZATION='Bearer token_bench_b_123')

    results = {}

    def measure_op(name, func, samples=25):
        timings = []
        query_counts = []
        for i in range(samples):
            reset_queries()
            t0 = time.perf_counter()
            func(i)
            elapsed = (time.perf_counter() - t0) * 1000.0 # ms
            timings.append(elapsed)
            query_counts.append(len(connection.queries))
        timings.sort()
        p50 = percentile(timings, 50)
        p95 = percentile(timings, 95)
        avg_q = statistics.mean(query_counts)
        results[name] = {
            'samples': len(timings),
            'min': timings[0],
            'max': timings[-1],
            'p50': p50,
            'p95': p95,
            'avg_queries': avg_q,
        }
        print(f"  {name:<32}: p50={p50:6.2f}ms | p95={p95:6.2f}ms | queries={avg_q:4.1f} | N={len(timings)}")

    print("\n[Phase 1] Measuring Warm Backend API Operations...")

    # 1. Profile Me (Warm Session Cache)
    measure_op("Auth Profile (/me)", lambda i: client_a.get('/api/auth/profile/me/'))

    # 2. Conversation List API
    measure_op("Conversation List API", lambda i: client_a.get('/api/auth/conversations/'))

    # 3. Message History API (limit=50)
    measure_op("Chat Message History API", lambda i: client_a.get(f'/api/auth/conversations/{conv.id}/messages/?limit=50'))

    # 4. Message Send REST
    measure_op("Message Send (REST)", lambda i: client_a.post(
        f'/api/auth/conversations/{conv.id}/messages/send/',
        data=json.dumps({'content': f'Benchmark test message {i}', 'client_message_id': f'bench-msg-{time.time()}-{i}'}),
        content_type='application/json'
    ))

    # 5. Profile Search Exact ID
    measure_op("Profile Search (Exact ID)", lambda i: client_a.get(f'/api/auth/profiles/search/?q={prof_b.profile_id}'))

    # 6. Profile Search Display Name
    measure_op("Profile Search (Name)", lambda i: client_a.get('/api/auth/profiles/search/?q=Bob'))

    # 7. Direct Conversation Creation / Reuse
    measure_op("Conversation Get/Create", lambda i: client_a.post(
        '/api/auth/conversations/',
        data=json.dumps({'profile_id': prof_b.profile_id}),
        content_type='application/json'
    ))

    # 8. Message Edit
    seed_msg = Message.objects.filter(conversation=conv, sender=user_a).first()
    measure_op("Message Edit API", lambda i: client_a.put(
        f'/api/auth/conversations/{conv.id}/messages/{seed_msg.id}/edit/',
        data=json.dumps({'content': f'Edited message iteration {i}'}),
        content_type='application/json'
    ))

    # 9. Message Delete for Me
    temp_msg_me = Message.objects.create(conversation=conv, sender=user_b, content='Delete me test')
    measure_op("Message Delete for Me", lambda i: client_a.delete(
        f'/api/auth/conversations/{conv.id}/messages/{temp_msg_me.id}/delete/?type=me'
    ), samples=20)

    # 10. Message Delete for Everyone
    temp_msgs = [Message.objects.create(conversation=conv, sender=user_a, content=f'Delete everyone {k}') for k in range(25)]
    measure_op("Message Delete for Everyone", lambda i: client_a.delete(
        f'/api/auth/conversations/{conv.id}/messages/{temp_msgs[i].id}/delete/?type=everyone'
    ), samples=20)

    # WebSocket Real-Time Benchmarks
    print("\n[Phase 2] Measuring Real-Time WebSocket Operations...")
    async def measure_websockets():
        ws_results = {}
        # Connect communicator for User A and User B
        comm_a = WebsocketCommunicator(application, f"/ws/chat/?token={sess_a.token}")
        comm_b = WebsocketCommunicator(application, f"/ws/chat/?token={sess_b.token}")

        connected_a, _ = await comm_a.connect()
        connected_b, _ = await comm_b.connect()
        assert connected_a and connected_b

        async def get_next_type(comm, expected_types, timeout=4, predicate=None):
            while True:
                msg = await comm.receive_json_from(timeout=timeout)
                if msg.get('type') in expected_types:
                    if predicate is None or predicate(msg):
                        return msg

        await comm_a.send_json_to({'type': 'join_conversation', 'conversation_id': conv.id})
        await get_next_type(comm_a, ['joined_conversation'])
        await comm_b.send_json_to({'type': 'join_conversation', 'conversation_id': conv.id})
        await get_next_type(comm_b, ['joined_conversation'])

        # Measure WebSocket Send -> ACK round trip (Sender perspective)
        ack_timings = []
        delivery_timings = []
        for i in range(25):
            c_msg_id = f'ws-bench-{time.time()}-{i}'
            t0 = time.perf_counter()
            await comm_a.send_json_to({
                'type': 'chat_message',
                'conversation_id': conv.id,
                'content': f'Realtime WS message {i}',
                'client_message_id': c_msg_id
            })

            # Wait for ACK on comm_a
            ev_ack = await get_next_type(
                comm_a,
                ['message_ack'],
                predicate=lambda m: m.get('client_message_id') == c_msg_id
            )
            t_ack = (time.perf_counter() - t0) * 1000.0

            # Wait for delivery event on comm_b
            ev_del = await get_next_type(
                comm_b,
                ['new_message'],
                predicate=lambda m: m.get('message', {}).get('client_message_id') == c_msg_id
            )
            t_del = (time.perf_counter() - t0) * 1000.0

            ack_timings.append(t_ack)
            delivery_timings.append(t_del)

        await comm_a.disconnect()
        await comm_b.disconnect()

        ack_timings.sort()
        delivery_timings.sort()
        p50_ack = percentile(ack_timings, 50)
        p95_ack = percentile(ack_timings, 95)
        p50_del = percentile(delivery_timings, 50)
        p95_del = percentile(delivery_timings, 95)
        print(f"  {'WS Send -> ACK (Sender)':<32}: p50={p50_ack:6.2f}ms | p95={p95_ack:6.2f}ms | N={len(ack_timings)}")
        print(f"  {'WS Recipient Delivery':<32}: p50={p50_del:6.2f}ms | p95={p95_del:6.2f}ms | N={len(delivery_timings)}")

        results['WS Message ACK'] = {
            'samples': len(ack_timings),
            'p50': p50_ack,
            'p95': p95_ack,
        }
        results['WS Recipient Delivery'] = {
            'samples': len(delivery_timings),
            'p50': p50_del,
            'p95': p95_del,
        }

    asyncio.run(measure_websockets())

    print("\n" + "=" * 70)
    print("BENCHMARK BASELINE COMPLETE")
    print("=" * 70)
    with open('benchmark_results_baseline.json', 'w') as f:
        json.dump(results, f, indent=2)

if __name__ == '__main__':
    run_benchmarks()
