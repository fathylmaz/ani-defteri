import base64, hashlib, io, json, re, uuid, warnings
from datetime import date, timedelta
from functools import wraps
from urllib.parse import urlsplit
from PIL import Image, ImageOps, UnidentifiedImageError
from django.conf import settings
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core import signing
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.db import transaction, IntegrityError
from django.db.models import Q, F
from django.http import JsonResponse, HttpResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.views.decorators.http import require_http_methods, require_GET, require_POST
from .models import Account, Memory, Media, Follow, Saved, RateLimit

CATEGORIES = ["Seyahat", "Doğa", "Sevdiklerim", "Küçük mutluluklar", "Özel günler"]


def error(message, status=400):
    return JsonResponse({"error": message}, status=status)


def csrf_failure(request, reason=""):
    return error(
        "Oturum güvenlik anahtarı yenilenmeli. Sayfayı yenileyip tekrar deneyin.", 403
    )


def data(request):
    try:
        value = json.loads(request.body)
        if not isinstance(value, dict):
            raise ValueError()
        return value
    except (ValueError, UnicodeDecodeError):
        raise ValueError("Invalid JSON")


def authenticated(fn):
    @wraps(fn)
    def wrapped(request, *a, **kw):
        if not request.user.is_authenticated:
            return error("Bu işlem için giriş yapmalısın.", 401)
        return fn(request, *a, **kw)

    return wrapped


def limited(request, scope, limit=15, identity="", seconds=900):
    # No untrusted forwarded IP headers are used. Proxy also applies a per-client limit.
    key = hashlib.sha256(
        (scope + "|" + request.META.get("REMOTE_ADDR", "") + "|" + identity).encode()
    ).hexdigest()
    now = timezone.now()
    with transaction.atomic():
        entry, _ = RateLimit.objects.get_or_create(key=key, defaults={"window": now})
        entry = RateLimit.objects.select_for_update().get(pk=key)
        if entry.window < now - timedelta(seconds=seconds):
            entry.window = now
            entry.count = 0
        entry.count += 1
        entry.save(update_fields=["window", "count"])
        return entry.count > limit


def valid_username(value):
    return bool(re.fullmatch(r"[a-z][a-z0-9_]{2,23}", value)) and value not in [
        "admin",
        "api",
        "support",
        "anidefteri",
    ]


def user_json(user):
    if not user.is_authenticated:
        return None
    return {
        "id": str(user.pk),
        "username": user.username,
        "name": user.display_name or user.username,
        "avatar": str(user.avatar_id) if user.avatar_id else None,
    }


def visible(user):
    return Q(is_draft=False) & (Q(visibility="public") | (
        Q(owner=user) if user.is_authenticated else Q(pk__isnull=True)
    ))


def memory_json(m, viewer=None):
    keys = [str(i.pk) for i in m.images.all()]
    return {
        "id": str(m.pk),
        "owner": str(m.owner_id),
        "author": m.owner.display_name or m.owner.username,
        "username": m.owner.username,
        "avatar": str(m.owner.avatar_id) if m.owner.avatar_id else None,
        "draft": m.is_draft,
        "revision": m.revision,
        "album": str(m.album_id) if viewer and viewer.is_authenticated and viewer.pk == m.owner_id and m.album_id else "",
        "title": m.title,
        "body": m.body,
        "date": m.date.isoformat(),
        "location": m.location,
        "category": m.category,
        "visibility": m.visibility,
        "created": m.created.isoformat(),
        "photo": keys[0] if keys else None,
        "photos": json.dumps(keys),
    }


def memories_query():
    from django.db.models import Prefetch

    return Memory.objects.select_related("owner").prefetch_related(
        Prefetch("images", queryset=Media.objects.defer("data"))
    )


def profile_json(p, user):
    return {
        "username": p.username,
        "displayName": p.display_name,
        "bio": p.bio,
        "instagram": p.instagram,
        "website": p.website,
        "avatar": str(p.avatar_id) if p.avatar_id else None,
        "followers": p.follower_edges.count(),
        "following": p.following_edges.count(),
        "memoryCount": p.memories.filter(visibility="public", is_draft=False).count(),
        "isSelf": user.is_authenticated and user.pk == p.pk,
        "isFollowing": user.is_authenticated
        and Follow.objects.filter(follower=user, following=p).exists(),
    }


def image_bytes(file, max_size=8 * 1024 * 1024):
    if file.size > max_size:
        raise ValueError("Fotoğraf boyut sınırı aşıldı.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(file) as image:
                if (
                    image.format not in ["JPEG", "PNG", "WEBP"]
                    or image.width * image.height > 24_000_000
                ):
                    raise ValueError(
                        "Fotoğraf JPG, PNG veya WebP ve en fazla 24 megapiksel olmalı."
                    )
                image.load()
                image = ImageOps.exif_transpose(image)
                # Normalize and remove EXIF metadata before storage.
                image.thumbnail((4000, 4000))
                buf = io.BytesIO()
                image.convert("RGBA" if "A" in image.getbands() else "RGB").save(
                    buf, "WEBP", quality=90
                )
                return buf.getvalue(), "image/webp"
    except (
        UnidentifiedImageError,
        OSError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise ValueError("Geçerli bir fotoğraf seçmelisin.") from exc


@require_GET
def health(request):
    Account.objects.exists()
    return JsonResponse({"ok": True})


@require_GET
def session(request):
    return JsonResponse(
        {"user": user_json(request.user), "csrfToken": get_token(request)}
    )


def verification_mail(user):
    token = signing.dumps(
        {"id": str(user.pk), "email": user.email}, salt="verify-email"
    )
    send_mail(
        "Anı Defteri — E-postanı doğrula",
        f"Hesabını doğrulamak için bağlantıyı aç:\n{settings.APP_URL}/hesap?mode=verify&token={token}\nBağlantı 24 saat geçerlidir.",
        settings.DEFAULT_FROM_EMAIL,
        [user.email],
    )


@require_POST
def register(request):
    if limited(request, "register", 8):
        return error("Çok fazla deneme. Daha sonra tekrar dene.", 429)
    d = data(request)
    email = str(d.get("email", "")).strip().lower()
    username = str(d.get("username", "")).strip().lower()
    password = str(d.get("password", ""))
    try:
        validate_email(email)
        if not valid_username(username):
            return error(
                "Kullanıcı adı 3–24 karakter, harfle başlayan a–z, 0–9 veya alt çizgi olmalı."
            )
        if len(password) > 128:
            return error("Şifre en fazla 128 karakter olabilir.")
        candidate = Account(email=email, username=username)
        validate_password(password, candidate)
    except ValidationError as exc:
        return error(" ".join(exc.messages))
    try:
        with transaction.atomic():
            candidate.set_password(password)
            candidate.email_verified = not settings.REQUIRE_EMAIL_VERIFICATION
            candidate.is_active = not settings.REQUIRE_EMAIL_VERIFICATION
            candidate.save()
    except IntegrityError:
        return error("Bu e-posta veya kullanıcı adı kullanılıyor.", 409)
    if settings.REQUIRE_EMAIL_VERIFICATION:
        try:
            verification_mail(candidate)
        except Exception:
            return error(
                "Hesabın oluşturuldu ancak e-posta gönderilemedi. Doğrulama e-postasını yeniden gönder seçeneğini kullan.",
                503,
            )
        return JsonResponse(
            {
                "verificationRequired": True,
                "message": "E-postandaki doğrulama bağlantısını açtıktan sonra giriş yapabilirsin.",
            },
            status=201,
        )
    login(request, candidate, backend="django.contrib.auth.backends.ModelBackend")
    return JsonResponse({"user": user_json(candidate)}, status=201)


@require_POST
def sign_in(request):
    d = data(request)
    email = str(d.get("email", "")).strip().lower()
    password = str(d.get("password", ""))
    if limited(request, "login", 10, email) or limited(request, "login-all", 100):
        return error("Çok fazla giriş denemesi. 15 dakika sonra tekrar dene.", 429)
    if len(password) > 128:
        return error("E-posta veya şifre hatalı.", 401)
    user = authenticate(request, email=email, password=password)
    if user is None:
        return error("E-posta veya şifre hatalı ya da e-posta doğrulanmamış.", 401)
    login(request, user)
    return JsonResponse({"user": user_json(user)})


@require_POST
def sign_out(request):
    logout(request)
    return JsonResponse({"ok": True})


@require_POST
def verify(request):
    try:
        payload = signing.loads(
            data(request).get("token", ""), salt="verify-email", max_age=86400
        )
        user = Account.objects.get(pk=payload["id"], email=payload["email"])
    except (signing.BadSignature, Account.DoesNotExist, KeyError, ValueError):
        return error("Doğrulama bağlantısı geçersiz veya süresi dolmuş.")
    # A verified but suspended account must not be reactivated by an old token.
    if not user.email_verified:
        user.email_verified = True
        user.is_active = True
        user.save(update_fields=["email_verified", "is_active"])
    return JsonResponse({"message": "E-posta doğrulandı. Şimdi giriş yapabilirsin."})


@require_POST
def resend(request):
    email = str(data(request).get("email", "")).strip().lower()
    if limited(request, "resend", 3, email) or limited(request, "resend-all", 30):
        return error("Daha sonra tekrar dene.", 429)
    user = Account.objects.filter(email=email, email_verified=False).first()
    if user:
        try:
            verification_mail(user)
        except Exception:
            pass
    return JsonResponse(
        {"message": "Uygun bir hesap varsa doğrulama bağlantısı gönderildi."}
    )


@require_POST
def forgot(request):
    email = str(data(request).get("email", "")).strip().lower()
    if limited(request, "forgot", 3, email) or limited(request, "forgot-all", 30):
        return error("Daha sonra tekrar dene.", 429)
    user = Account.objects.filter(email=email, is_active=True).first()
    if user:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        try:
            send_mail(
                "Anı Defteri — Şifre yenileme",
                f"Şifreni yenilemek için:\n{settings.APP_URL}/hesap?mode=reset&uid={uid}&token={token}\nBu isteği sen yapmadıysan bu mesajı yok sayabilirsin.",
                settings.DEFAULT_FROM_EMAIL,
                [email],
            )
        except Exception:
            pass
    return JsonResponse(
        {
            "message": "Bu adresle kayıtlı bir hesap varsa şifre yenileme bağlantısı gönderildi."
        }
    )


@require_POST
def reset(request):
    if limited(request, "reset", 15):
        return error("Daha sonra tekrar dene.", 429)
    d = data(request)
    try:
        user = Account.objects.get(
            pk=force_str(urlsafe_base64_decode(d.get("uid", ""))), is_active=True
        )
    except (ValueError, ValidationError, Account.DoesNotExist, UnicodeDecodeError):
        return error("Geçersiz veya süresi dolmuş bağlantı.")
    if not default_token_generator.check_token(user, d.get("token", "")):
        return error("Geçersiz veya süresi dolmuş bağlantı.")
    password = str(d.get("password", ""))
    try:
        if len(password) > 128:
            raise ValidationError("Şifre en fazla 128 karakter olabilir.")
        validate_password(password, user)
    except ValidationError as exc:
        return error(" ".join(exc.messages))
    user.set_password(password)
    user.save(update_fields=["password"])
    return JsonResponse(
        {"message": "Şifren yenilendi. Yeni şifrenle giriş yapabilirsin."}
    )


@require_http_methods(["GET", "POST", "DELETE"])
def memories(request):
    if request.method == "GET":
        rows = memories_query().filter(visible(request.user))[:500]
        following = (
            list(request.user.following_edges.values_list("following_id", flat=True))
            if request.user.is_authenticated
            else []
        )
        saved = (
            list(request.user.saved_items.values_list("memory_id", flat=True))
            if request.user.is_authenticated
            else []
        )
        return JsonResponse(
            {
                "memories": [memory_json(m, request.user) for m in rows],
                "user": user_json(request.user),
                "following": [str(x) for x in following],
                "saved": saved,
            }
        )
    if not request.user.is_authenticated:
        return error("Önce giriş yapmalısın.", 401)
    if request.method == "DELETE":
        try:
            m = Memory.objects.filter(
                pk=request.GET.get("id"), owner=request.user
            ).first()
        except (ValueError, ValidationError):
            m = None
        if not m:
            return error("Anı bulunamadı.", 404)
        with transaction.atomic():
            Saved.objects.filter(memory_id=str(m.pk)).delete()
            m.delete()
        return JsonResponse({"ok": True})
    if limited(request, "memories", 30, str(request.user.pk), 3600):
        return error("Saatlik paylaşım sınırına ulaştın.", 429)
    f = request.POST
    title = f.get("title", "").strip()
    body = f.get("body", "").strip()
    visibility = f.get("visibility")
    category = f.get("category")
    try:
        day = date.fromisoformat(f.get("date", ""))
    except ValueError:
        return error("Geçerli bir tarih seç.")
    if (
        not title
        or len(title) > 120
        or not body
        or len(body) > 10000
        or visibility not in ["public", "private"]
        or category not in CATEGORIES
    ):
        return error("Başlık, hikâye, kategori ve görünürlüğü kontrol et.")
    files = request.FILES.getlist("photo")
    if len(files) > 10 or sum(f.size for f in files) > 40 * 1024 * 1024:
        return error("En fazla 10 fotoğraf ve toplam 40 MB yükleyebilirsin.")
    try:
        images = [image_bytes(f) for f in files]
    except ValueError as exc:
        return error(str(exc))
    with transaction.atomic():
        m = Memory.objects.create(
            owner=request.user,
            title=title,
            body=body,
            date=day,
            location=f.get("location", "").strip()[:120],
            category=category,
            visibility=visibility,
        )
        for i, (content, mime) in enumerate(images):
            Media.objects.create(
                owner=request.user,
                memory=m,
                data=content,
                content_type=mime,
                position=i,
            )
    return JsonResponse({"id": str(m.pk)}, status=201)


@require_GET
def photo(request, avatar=False):
    try:
        media = Media.objects.select_related("memory").get(pk=request.GET.get("id"))
    except (Media.DoesNotExist, ValueError, ValidationError):
        return error("Fotoğraf bulunamadı.", 404)
    if avatar:
        allowed = Account.objects.filter(avatar=media).exists()
    else:
        allowed = media.memory_id and (
            (media.memory.visibility == "public" and not media.memory.is_draft)
            or request.user.is_authenticated
            and media.owner_id == request.user.pk
        )
    if not allowed:
        return error("Fotoğraf bulunamadı.", 404)
    response = HttpResponse(bytes(media.data), content_type=media.content_type)
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    return response


@require_http_methods(["GET", "POST"])
def profiles(request):
    if request.method == "GET":
        username = request.GET.get("username", "").strip().lower()
        if username:
            p = Account.objects.filter(username=username, is_active=True).first()
            if not p:
                return error("Kullanıcı bulunamadı.", 404)
            people = []
            relation = request.GET.get("relation")
            if relation == "followers":
                people = list(
                    p.follower_edges.filter(follower__is_active=True).values_list(
                        "follower__username", flat=True
                    )[:100]
                )
            if relation == "following":
                people = list(
                    p.following_edges.filter(following__is_active=True).values_list(
                        "following__username", flat=True
                    )[:100]
                )
            rows = memories_query().filter(owner=p).filter(visible(request.user))[:500]
            return JsonResponse(
                {
                    "profile": profile_json(p, request.user),
                    "memories": [memory_json(m, request.user) for m in rows],
                    "people": [{"username": x} for x in people],
                }
            )
        query = request.GET.get("q", "")[:24]
        rows = Account.objects.filter(
            is_active=True, username__icontains=query
        ).order_by("-date_joined")[:50]
        return JsonResponse({"profiles": [profile_json(p, request.user) for p in rows]})
    if not request.user.is_authenticated:
        return error("Önce giriş yapmalısın.", 401)
    f = request.POST
    name = f.get("displayName", "").strip()
    bio = f.get("bio", "").strip()
    instagram = f.get("instagram", "").strip().lstrip("@")
    website = f.get("website", "").strip()
    if (
        len(name) > 60
        or len(bio) > 300
        or len(instagram) > 30
        or instagram
        and not re.fullmatch(r"[a-zA-Z0-9_.]+", instagram)
    ):
        return error(
            "Profil alanlarının uzunluklarını ve Instagram kullanıcı adını kontrol et."
        )
    if website:
        try:
            u = urlsplit(website)
            if (
                len(website) > 500
                or u.scheme not in ["http", "https"]
                or not u.hostname
                or u.username
                or u.password
            ):
                raise ValueError()
        except ValueError:
            return error("Geçerli bir http:// veya https:// adresi yaz.")
    image = None
    if "avatar" in request.FILES:
        try:
            image = image_bytes(request.FILES["avatar"], 5 * 1024 * 1024)
        except ValueError as exc:
            return error(str(exc))
    with transaction.atomic():
        p = Account.objects.select_for_update().get(pk=request.user.pk)
        old = p.avatar_id
        p.display_name = name
        p.bio = bio
        p.instagram = instagram
        p.website = website
        if image:
            p.avatar = Media.objects.create(
                owner=p, data=image[0], content_type=image[1]
            )
        elif f.get("removeAvatar") == "true":
            p.avatar = None
        p.save(update_fields=["display_name", "bio", "instagram", "website", "avatar"])
        if old and old != p.avatar_id:
            Media.objects.filter(pk=old, owner=p, memory__isnull=True).delete()
    return JsonResponse({"ok": True})


@require_http_methods(["POST", "DELETE"])
@authenticated
def follows(request):
    username = str(data(request).get("username", "")).lower()
    p = Account.objects.filter(username=username, is_active=True).first()
    if not p:
        return error("Kullanıcı bulunamadı.", 404)
    if p.pk == request.user.pk:
        return error("Kendini takip edemezsin.")
    if request.method == "POST":
        Follow.objects.get_or_create(follower=request.user, following=p)
    else:
        Follow.objects.filter(follower=request.user, following=p).delete()
    return JsonResponse({"ok": True})


@require_http_methods(["POST", "DELETE"])
@authenticated
def saved(request):
    mid = str(data(request).get("id", ""))
    if request.method == "DELETE":
        Saved.objects.filter(owner=request.user, memory_id=mid).delete()
    else:
        if mid not in ["demo1", "demo2", "demo3"]:
            try:
                exists = (
                    Memory.objects.filter(pk=mid).filter(visible(request.user)).exists()
                )
            except (ValidationError, ValueError):
                exists = False
            if not exists:
                return error("Anı bulunamadı.", 404)
        Saved.objects.get_or_create(owner=request.user, memory_id=mid)
    return JsonResponse({"ok": True})


@require_GET
@authenticated
def export_account(request):
    rows = list(memories_query().filter(owner=request.user))
    media = Media.objects.filter(owner=request.user)
    from django.db.models.functions import Length
    from django.db.models import Sum

    size = media.annotate(n=Length("data")).aggregate(total=Sum("n"))["total"] or 0
    if size > 45 * 1024 * 1024:
        return error("Bu hesap büyük; sunucudaki yedekleme komutunu kullanın.", 413)
    payload = {
        "format": "ani-defteri-account-v1",
        "albums": list(request.user.albums.values("id", "name")),
        "profile": profile_json(request.user, request.user),
        "memories": [memory_json(m, request.user) for m in rows],
        "media": [
            {
                "key": str(m.pk),
                "mime": m.content_type,
                "base64": base64.b64encode(bytes(m.data)).decode(),
            }
            for m in media
        ],
        "following": list(
            request.user.following_edges.values_list("following__username", flat=True)
        ),
        "saved": list(request.user.saved_items.values_list("memory_id", flat=True)),
    }
    r = JsonResponse(payload, json_dumps_params={"ensure_ascii": False})
    r["Content-Disposition"] = 'attachment; filename="ani-defteri-yedek.json"'
    r["Cache-Control"] = "no-store"
    return r
