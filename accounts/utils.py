from rest_framework.views import exception_handler
from rest_framework.response import Response
from pywebpush import webpush, WebPushException
from django.conf import settings
import json

def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is not None:
        # DRF default error data (chിലപ്പോൾ dict, chിലപ്പോൾ list)
        error_data = response.data

        # First readable message extract cheyyuka
        message = "Something went wrong."
        if isinstance(error_data, dict):
            if 'detail' in error_data:
                message = str(error_data['detail'])
            else:
                first_key = next(iter(error_data))
                first_value = error_data[first_key]
                if isinstance(first_value, list):
                    message = str(first_value[0])
                else:
                    message = str(first_value)
        elif isinstance(error_data, list):
            message = str(error_data[0])

        response.data = {
            "success": False,
            "message": message,
            "errors": error_data
        }

    return response


def success_response(message="Success", data=None, status_code=200):
    from rest_framework.response import Response
    is_success = status_code < 400   # 400-inu thaazhe ella-um success, mukalil ella-um error
    return Response({
        "success": is_success,
        "message": message,
        "data": data
    }, status=status_code)

from rest_framework import permissions
def send_push_notification(user, title, body, url='/'):
    subscriptions = user.push_subscriptions.all()
    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {
                        "p256dh": sub.p256dh_key,
                        "auth": sub.auth_key,
                    }
                },
                data=json.dumps({"title": title, "body": body, "url": url}),
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": settings.VAPID_ADMIN_EMAIL}
            )
        except WebPushException as e:
            # Subscription expired/invalid aayal, database il ninnu remove cheyyuka
            if e.response is not None and e.response.status_code in [404, 410]:
                sub.delete()
            print(f"Push failed: {e}")

class IsAdminUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)
    
import resend
import random
from django.conf import settings as django_settings

def send_otp_email(user, otp_code):
    resend.api_key = django_settings.RESEND_API_KEY
    try:
        resend.Emails.send({
            "from": "Lynqo <onboarding@lynqoweb.website>",
            "to": user.email,
            "subject": "Verify your Lynqo account",
            "html": f"<p>Hi {user.full_name or user.username},</p><p>Your verification code is:</p><h2>{otp_code}</h2><p>This code expires in 10 minutes.</p>"
        })
    except Exception as e:
        print(f"Failed to send OTP email: {e}")


def generate_otp():
    return str(random.randint(100000, 999999))