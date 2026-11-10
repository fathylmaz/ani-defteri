from django.urls import path
from journal import views as v
from journal import notebook as n

urlpatterns = [
    path("api/notebook", n.notebook),
    path("api/anniversaries", n.anniversaries),
    path("api/albums", n.albums),
    path("api/entries/<uuid:entry_id>", n.save_entry),
    path("api/health", v.health),
    path("api/auth/session", v.session),
    path("api/auth/register", v.register),
    path("api/auth/login", v.sign_in),
    path("api/auth/logout", v.sign_out),
    path("api/auth/verify", v.verify),
    path("api/auth/resend", v.resend),
    path("api/auth/forgot", v.forgot),
    path("api/auth/reset", v.reset),
    path("api/memories", v.memories),
    path("api/photo", v.photo),
    path("api/avatar", v.photo, {"avatar": True}),
    path("api/profiles", v.profiles),
    path("api/follows", v.follows),
    path("api/saved", v.saved),
    path("api/export", v.export_account),
]
