from django.urls import path
from .views import (
    ProfileCreateView, ProfileRecoverView, ProfileMeView,
    ProfileUpdateView, ProfileRegenerateRecoveryCodeView, ProfileLogoutView,
    ProfileSearchView, SendConnectRequestView, IncomingRequestsView,
    OutgoingRequestsView, AcceptConnectRequestView, DeclineConnectRequestView,
    CancelConnectRequestView, ConnectedProfilesView,
    ConversationListView, ConversationDetailView, MessageListView,
    SendMessageView
)

urlpatterns = [
    # Profile & Passwordless Auth
    path('profile/create/', ProfileCreateView.as_view(), name='profile-create'),
    path('profile/recover/', ProfileRecoverView.as_view(), name='profile-recover'),
    path('profile/me/', ProfileMeView.as_view(), name='profile-me'),
    path('profile/', ProfileMeView.as_view(), name='profile-detail'),
    path('profile/update/', ProfileUpdateView.as_view(), name='profile-update'),
    path('profile/regenerate-recovery-code/', ProfileRegenerateRecoveryCodeView.as_view(), name='profile-regenerate-code'),
    path('profile/logout/', ProfileLogoutView.as_view(), name='profile-logout'),

    # Profile Search & Connections
    path('profiles/search/', ProfileSearchView.as_view(), name='profile-search'),
    path('connections/', ConnectedProfilesView.as_view(), name='connected-profiles'),
    path('connections/request/', SendConnectRequestView.as_view(), name='connection-send-request'),
    path('connections/requests/incoming/', IncomingRequestsView.as_view(), name='connection-incoming-requests'),
    path('connections/requests/outgoing/', OutgoingRequestsView.as_view(), name='connection-outgoing-requests'),
    path('connections/requests/<int:request_id>/accept/', AcceptConnectRequestView.as_view(), name='connection-accept-request'),
    path('connections/requests/<int:request_id>/decline/', DeclineConnectRequestView.as_view(), name='connection-decline-request'),
    path('connections/requests/<int:request_id>/cancel/', CancelConnectRequestView.as_view(), name='connection-cancel-request'),

    # Conversations & Messaging
    path('conversations/', ConversationListView.as_view(), name='conversation-list'),
    path('conversations/<int:conversation_id>/', ConversationDetailView.as_view(), name='conversation-detail'),
    path('conversations/<int:conversation_id>/messages/', MessageListView.as_view(), name='conversation-messages'),
    path('conversations/<int:conversation_id>/messages/send/', SendMessageView.as_view(), name='conversation-send-message'),
]
