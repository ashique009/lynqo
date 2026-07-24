from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, Interest, ConnectRequest, Conversation, Message

admin.site.register(User, UserAdmin)
admin.site.register(Interest)
admin.site.register(ConnectRequest)
admin.site.register(Conversation)
admin.site.register(Message)
