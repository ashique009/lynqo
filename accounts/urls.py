from django.urls import path
from .views import (
    SignupView, LoginView, LogoutView,
    ProfileCreateView, ProfileDetailView, ProfileUpdateView,
    InterestListView,
    SendConnectRequestView, PendingRequestsView, SentRequestsView,
    AcceptConnectRequestView, DeclineConnectRequestView,
    SuggestionsView,
    ConversationListView, ConversationDetailView,
    SendMessageView, GetMessagesView,
    AdminLoginView,AdminDashboardStatsView, AdminUserListView, AdminUserBanView, AdminUserUnbanView,
    AdminUserDeleteView,NotificationCountView,ForgotPasswordView, ResetPasswordView,PushSubscribeView, PushUnsubscribeView,OnlineStatusView,
    TypingIndicatorView, TypingStatusView,EditMessageView, DeleteMessageView
)

urlpatterns = [
    path('signup/', SignupView.as_view(), name='signup'),
    path('login/', LoginView.as_view(), name='login'),
    path('logout/', LogoutView.as_view(), name='logout'),

    path('profile/create/', ProfileCreateView.as_view(), name='profile-create'),
    path('profile/', ProfileDetailView.as_view(), name='profile-detail'),
    path('profile/update/', ProfileUpdateView.as_view(), name='profile-update'),

    path('interests/', InterestListView.as_view(), name='interest-list'),

    path('requests/send/', SendConnectRequestView.as_view(), name='request-send'),
    path('requests/pending/', PendingRequestsView.as_view(), name='request-pending'),
    path('requests/accept/', AcceptConnectRequestView.as_view(), name='request-accept'),
    path('requests/decline/', DeclineConnectRequestView.as_view(), name='request-decline'),
    path('requests/sent/', SentRequestsView.as_view(), name='request-sent'),

    path('suggestions/', SuggestionsView.as_view(), name='suggestions'),

    path('conversations/', ConversationListView.as_view(), name='conversation-list'),
    path('conversations/<int:conversation_id>/', ConversationDetailView.as_view(), name='conversation-detail'),

    path('messages/send/', SendMessageView.as_view(), name='message-send'),
    path('messages/<int:conversation_id>/', GetMessagesView.as_view(), name='message-list'),
    path('admin-login/', AdminLoginView.as_view(), name='admin-login'),
    path('admin/dashboard-stats/', AdminDashboardStatsView.as_view(), name='admin-dashboard-stats'),
    path('admin/users/', AdminUserListView.as_view(), name='admin-user-list'),
    path('admin/users/<int:user_id>/ban/', AdminUserBanView.as_view(), name='admin-user-ban'),
    path('admin/users/<int:user_id>/unban/', AdminUserUnbanView.as_view(), name='admin-user-unban'),
    path('admin/users/<int:user_id>/delete/', AdminUserDeleteView.as_view(), name='admin-user-delete'),
    path('notifications/count/', NotificationCountView.as_view(), name='notification-count'),
    path('forgot-password/', ForgotPasswordView.as_view(), name='forgot-password'),
    path('reset-password/', ResetPasswordView.as_view(), name='reset-password'),
    path('push/subscribe/', PushSubscribeView.as_view(), name='push-subscribe'),
    path('push/unsubscribe/', PushUnsubscribeView.as_view(), name='push-unsubscribe'),
    path('online-status/<int:user_id>/', OnlineStatusView.as_view(), name='online-status'),
    path('messages/typing/', TypingIndicatorView.as_view(), name='typing-indicator'),
    path('messages/typing-status/<int:conversation_id>/', TypingStatusView.as_view(), name='typing-status'),
    path('messages/<int:message_id>/edit/', EditMessageView.as_view(), name='message-edit'),
    path('messages/<int:message_id>/delete/', DeleteMessageView.as_view(), name='message-delete'),
]