import os
import sys
import time
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.test import Client
from django.db import connection, reset_queries
from django.conf import settings
from accounts.models import User, Profile, ProfileSession, ConnectRequest, Conversation, Message

def run_benchmarks():
    print("=" * 60)
    print("RUNNING LYNQO PERFORMANCE BASELINE BENCHMARK")
    print("=" * 60)

    # Ensure query logging is active
    settings.DEBUG = True
    reset_queries()

    # Create test users and conversation
    u1, _ = User.objects.get_or_create(username="bench_alice", defaults={'full_name': "Alice"})
    p1, _ = Profile.objects.get_or_create(user=u1, defaults={'profile_id': "LYNQ-ALICE", 'display_name': "Alice"})
    s1, _ = ProfileSession.objects.get_or_create(user=u1, token="bench-token-alice", defaults={'is_active': True})

    u2, _ = User.objects.get_or_create(username="bench_bob", defaults={'full_name': "Bob"})
    p2, _ = Profile.objects.get_or_create(user=u2, defaults={'profile_id': "LYNQ-BOB", 'display_name': "Bob"})
    s2, _ = ProfileSession.objects.get_or_create(user=u2, token="bench-token-bob", defaults={'is_active': True})

    cr, _ = ConnectRequest.objects.get_or_create(sender=u1, receiver=u2, defaults={'status': 'accepted'})
    if cr.status != 'accepted':
        cr.status = 'accepted'
        cr.save()

    conv, _ = Conversation.get_or_create_between(u1, u2)

    # Seed 50 messages if not present
    existing_count = Message.objects.filter(conversation=conv).count()
    if existing_count < 50:
        msgs = [
            Message(
                conversation=conv,
                sender=u1 if i % 2 == 0 else u2,
                content=f"Benchmark test message {i}",
                client_message_id=f"bench-msg-{i}",
                status='sent'
            )
            for i in range(existing_count, 50)
        ]
        Message.objects.bulk_create(msgs)

    client = Client()
    client.cookies['lynqo_session'] = s1.token

    benchmarks = [
        ("GET /api/auth/profile/me/", lambda: client.get('/api/auth/profile/me/')),
        ("GET /api/auth/conversations/", lambda: client.get('/api/auth/conversations/')),
        (f"GET /api/auth/conversations/{conv.id}/", lambda: client.get(f'/api/auth/conversations/{conv.id}/')),
        (f"GET /api/auth/conversations/{conv.id}/messages/", lambda: client.get(f'/api/auth/conversations/{conv.id}/messages/?limit=50')),
        ("POST /api/auth/conversations/.../messages/send/", lambda: client.post(
            f'/api/auth/conversations/{conv.id}/messages/send/',
            data={'content': f'Benchmark new msg {time.time()}', 'client_message_id': f'bench-{time.time()}'},
            content_type='application/json'
        )),
    ]

    results = []
    # Warm up run
    for name, fn in benchmarks:
        fn()

    print("\n--- Endpoint Timings and Query Counts (10 iterations each) ---")
    for name, fn in benchmarks:
        times = []
        queries_counts = []
        for _ in range(10):
            reset_queries()
            t0 = time.perf_counter()
            res = fn()
            t1 = time.perf_counter()
            assert res.status_code in [200, 201], f"{name} failed with {res.status_code}"
            times.append((t1 - t0) * 1000)
            queries_counts.append(len(connection.queries))

        times.sort()
        p50 = times[len(times) // 2]
        p95 = times[int(len(times) * 0.95)]
        avg_queries = sum(queries_counts) / len(queries_counts)
        print(f"{name:50} | p50: {p50:6.2f}ms | p95: {p95:6.2f}ms | Queries: {avg_queries:4.1f}")
        results.append({
            'name': name,
            'p50': p50,
            'p95': p95,
            'queries': avg_queries,
        })

    print("=" * 60)
    return results

if __name__ == '__main__':
    run_benchmarks()
