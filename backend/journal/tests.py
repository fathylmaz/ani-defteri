from io import BytesIO
from urllib.parse import urlsplit, parse_qs
import json, re
from django.test import TestCase, Client, override_settings
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from .models import Account, Media, Memory, Follow, Saved


class JournalFlowTests(TestCase):
    password = "Gecenin-Sessizligi-394!"

    def register(self, client, email, username):
        return client.post(
            "/api/auth/register",
            {"email": email, "username": username, "password": self.password},
            content_type="application/json",
        )

    def picture(self):
        b = BytesIO()
        Image.new("RGB", (10, 10), "green").save(b, "PNG")
        return SimpleUploadedFile("test.png", b.getvalue(), content_type="image/png")

    @override_settings(REQUIRE_EMAIL_VERIFICATION=False)
    def test_private_gallery_follows_saved_and_sessions(self):
        a, b = Client(), Client()
        self.assertEqual(self.register(a, "a@example.test", "deniz").status_code, 201)
        self.assertEqual(self.register(b, "b@example.test", "orman").status_code, 201)
        user = Account.objects.get(username="deniz")
        self.assertTrue(user.check_password(self.password))
        self.assertNotEqual(user.password, self.password)
        self.assertEqual(
            self.register(Client(), "A@example.test", "diger").status_code, 409
        )
        self.assertEqual(
            b.post(
                "/api/follows", {"username": "deniz"}, content_type="application/json"
            ).status_code,
            200,
        )
        b.post("/api/follows", {"username": "deniz"}, content_type="application/json")
        self.assertEqual(Follow.objects.count(), 1)
        r = a.post(
            "/api/memories",
            {
                "title": "Yaz",
                "body": "İki an",
                "date": "2026-10-31",
                "visibility": "private",
                "category": "Seyahat",
                "photo": [self.picture(), self.picture()],
            },
        )
        self.assertEqual(r.status_code, 201, r.content)
        mid = r.json()["id"]
        row = a.get("/api/memories").json()["memories"][0]
        keys = json.loads(row["photos"])
        self.assertEqual(len(keys), 2)
        self.assertEqual(row["photo"], keys[0])
        self.assertEqual(b.get("/api/memories").json()["memories"], [])
        for key in keys:
            self.assertEqual(a.get("/api/photo", {"id": key}).status_code, 200)
            self.assertEqual(b.get("/api/photo", {"id": key}).status_code, 404)
        self.assertEqual(b.delete("/api/memories?id=" + mid).status_code, 404)
        self.assertEqual(
            a.post(
                "/api/saved", {"id": mid}, content_type="application/json"
            ).status_code,
            200,
        )
        r = a.post(
            "/api/profiles",
            {
                "displayName": "Deniz",
                "bio": "Merhaba",
                "instagram": "deniz",
                "avatar": self.picture(),
            },
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            b.get("/api/profiles", {"username": "deniz"}).json()["profile"]["bio"],
            "Merhaba",
        )
        self.assertEqual(a.post("/api/auth/logout").status_code, 200)
        self.assertIsNone(a.get("/api/auth/session").json()["user"])
        self.assertEqual(
            a.post(
                "/api/auth/login",
                {"email": "a@example.test", "password": self.password},
                content_type="application/json",
            ).status_code,
            200,
        )
        self.assertIn(mid, a.get("/api/memories").json()["saved"])
        a.delete("/api/memories?id=" + mid)
        self.assertEqual(Media.objects.filter(memory__isnull=False).count(), 0)

    @override_settings(
        REQUIRE_EMAIL_VERIFICATION=True,
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    )
    def test_email_ownership_and_password_recovery(self):
        c = Client()
        result = self.register(c, "a@example.test", "gezgin")
        self.assertTrue(result.json()["verificationRequired"])

        def credentials(password):
            return c.post(
                "/api/auth/login",
                {"email": "a@example.test", "password": password},
                content_type="application/json",
            )

        self.assertEqual(credentials(self.password).status_code, 401)
        token = parse_qs(
            urlsplit(re.search(r"https?://\S+", mail.outbox[-1].body).group()).query
        )["token"][0]
        self.assertEqual(
            c.post(
                "/api/auth/verify", {"token": token}, content_type="application/json"
            ).status_code,
            200,
        )
        self.assertEqual(credentials(self.password).status_code, 200)
        c.post(
            "/api/auth/forgot",
            {"email": "a@example.test"},
            content_type="application/json",
        )
        q = parse_qs(
            urlsplit(re.search(r"https?://\S+", mail.outbox[-1].body).group()).query
        )
        payload = {
            "token": q["token"][0],
            "uid": q["uid"][0],
            "password": "Farkli-yeni-Sifre-9031",
        }
        self.assertEqual(
            c.post(
                "/api/auth/reset", payload, content_type="application/json"
            ).status_code,
            200,
        )
        self.assertEqual(
            c.post(
                "/api/auth/reset", payload, content_type="application/json"
            ).status_code,
            400,
        )
        self.assertEqual(credentials(self.password).status_code, 401)
        self.assertEqual(credentials(payload["password"]).status_code, 200)

    @override_settings(REQUIRE_EMAIL_VERIFICATION=False)
    def test_csrf_required(self):
        c = Client(enforce_csrf_checks=True)
        self.assertEqual(self.register(c, "a@example.test", "deniz").status_code, 403)
        token = c.get("/api/auth/session").json()["csrfToken"]
        res = c.post(
            "/api/auth/register",
            {"email": "a@example.test", "username": "deniz", "password": self.password},
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(res.status_code, 201, res.content)

