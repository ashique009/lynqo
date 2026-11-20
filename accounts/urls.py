from django.urls import path
from .views import (
    LoginView, ProfileCreateView, ProfileRecoverView, ProfileMeView,
    ProfileUpdateView, ProfileRegenerateRecoveryCodeView, ProfileLogoutView,
    ProfileLogoutAllView, ActiveSessionsView,
    ProfileSearchView, SendConnectRequestView, IncomingRequestsView,
    OutgoingRequestsView, AcceptConnectRequestView, DeclineConnectRequestView,
    CancelConnectRequestView, ConnectedProfilesView,
    ConversationListView, ConversationDetailView, MessageListView,
    SendMessageView, ImageMessageUploadView, ImageMessageMediaView,
    VoiceMessageUploadView, VoiceMessageAudioView,
    MessageEditView, MessageDeleteView
)

urlpatterns = [
    # Profile & Password / Simple Auth
    path('login/', LoginView.as_view(), name='auth-login'),
    path('profile/login/', LoginView.as_view(), name='profile-login'),
    path('profile/create/', ProfileCreateView.as_view(), name='profile-create'),
    path('profile/recover/', ProfileRecoverView.as_view(), name='profile-recover'),
    path('profile/me/', ProfileMeView.as_view(), name='profile-me'),
    path('profile/', ProfileMeView.as_view(), name='profile-detail'),
    path('profile/update/', ProfileUpdateView.as_view(), name='profile-update'),
    path('profile/regenerate-recovery-code/', ProfileRegenerateRecoveryCodeView.as_view(), name='profile-regenerate-code'),
    path('profile/logout/', ProfileLogoutView.as_view(), name='profile-logout'),
    path('profile/logout-all/', ProfileLogoutAllView.as_view(), name='profile-logout-all'),
    path('profile/sessions/', ActiveSessionsView.as_view(), name='profile-sessions'),

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
    path('conversations/<int:conversation_id>/messages/image/', ImageMessageUploadView.as_view(), name='conversation-image-upload'),
    path('conversations/<int:conversation_id>/messages/<int:message_id>/image/', ImageMessageMediaView.as_view(), name='conversation-image-media'),
    path('conversations/<int:conversation_id>/messages/voice/', VoiceMessageUploadView.as_view(), name='conversation-voice-upload'),
    path('conversations/<int:conversation_id>/messages/<int:message_id>/audio/', VoiceMessageAudioView.as_view(), name='conversation-voice-audio'),
    path('conversations/<int:conversation_id>/messages/<int:message_id>/edit/', MessageEditView.as_view(), name='conversation-message-edit'),
    path('conversations/<int:conversation_id>/messages/<int:message_id>/delete/', MessageDeleteView.as_view(), name='conversation-message-delete'),
    path('conversations/<int:conversation_id>/messages/<int:message_id>/', MessageEditView.as_view(), name='conversation-message-action'),
]
