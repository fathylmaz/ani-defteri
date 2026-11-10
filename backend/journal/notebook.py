import json, uuid
from datetime import date
from django.db import transaction, IntegrityError
from django.http import JsonResponse
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.views.decorators.http import require_GET, require_http_methods, require_POST
from .models import Album, Memory, Media
from .views import authenticated, error, data, memories_query, memory_json, CATEGORIES, image_bytes, limited


def private_json(payload):
    r = JsonResponse(payload)
    r['Cache-Control'] = 'private, no-store'
    return r


@require_GET
@authenticated
def notebook(request):
    return private_json({
        'entries': [memory_json(m, request.user) for m in memories_query().filter(owner=request.user)],
        'albums': [{'id': str(a.pk), 'name': a.name, 'count': a.entries.count()} for a in request.user.albums.all()],
    })


@require_GET
@authenticated
def anniversaries(request):
    today = timezone.localdate()
    rows = memories_query().filter(owner=request.user, is_draft=False, date__month=today.month, date__day=today.day, date__year__lt=today.year)
    return private_json({'items': [{'years': today.year-m.date.year, 'memory': memory_json(m, request.user)} for m in rows]})


@require_http_methods(['POST', 'DELETE'])
@authenticated
def albums(request):
    d = data(request)
    if request.method == 'DELETE':
        try:
            a = Album.objects.filter(pk=d.get('id'), owner=request.user).first()
        except (ValueError, ValidationError):
            a = None
        if not a:
            return error('Albüm bulunamadı.', 404)
        a.delete()
        return JsonResponse({'ok': True})
    name = str(d.get('name', '')).strip()
    if not name or len(name) > 80:
        return error('Albüm adı 1–80 karakter olmalı.')
    try:
        with transaction.atomic():
            a = Album.objects.create(owner=request.user, name=name)
    except IntegrityError:
        return error('Bu isimde bir albümün zaten var.', 409)
    return JsonResponse({'id': str(a.pk), 'name': a.name}, status=201)


@require_POST
@authenticated
def save_entry(request, entry_id):
    f = request.POST
    action = f.get('action')
    title, body = f.get('title', '').strip(), f.get('body', '').strip()
    try:
        day = date.fromisoformat(f.get('date', ''))
        revision = int(f.get('revision', '0'))
        order = json.loads(f.get('order', '[]'))
        if not isinstance(order, list) or len(order) > 10 or len(set(order)) != len(order):
            raise ValueError()
        if any(str(uuid.UUID(k)) != k for k in order):
            raise ValueError()
    except (ValueError, TypeError, AttributeError):
        return error('Tarih veya fotoğraf sırası geçersiz.')
    if action not in ['draft', 'publish'] or len(title) > 120 or len(body) > 10000 or (action == 'publish' and (not title or not body)) or len(f.get('location', '')) > 120 or f.get('category') not in CATEGORIES or f.get('visibility') not in ['public', 'private']:
        return error('Başlık, hikâye, kategori ve görünürlüğü kontrol et.')
    album = None
    if f.get('album'):
        try:
            album = Album.objects.filter(pk=f['album'], owner=request.user).first()
        except (ValueError, ValidationError):
            pass
        if not album:
            return error('Albüm bulunamadı.', 404)
    if sum(upload.size for upload in request.FILES.values()) > 40 * 1024 * 1024:
        return error('Toplam 40 MB yükleyebilirsin.')
    with transaction.atomic():
        m = Memory.objects.select_for_update().filter(pk=entry_id).first()
        if m and m.owner_id != request.user.pk:
            return error('Anı bulunamadı.', 404)
        if (m and m.revision != revision) or (not m and revision != 0):
            return error('Anı başka bir pencerede değişti. Sayfayı yenileyip tekrar aç.', 409)
        if m and not m.is_draft and action == 'draft':
            return error('Yayımlanmış anı taslağa çevrilemez.')
        creating = m is None
        publishing = action == 'publish' and (not m or m.is_draft)
        if (creating or publishing) and limited(request, 'entry-create', 60, str(request.user.pk), 3600):
            return error('Saatlik kayıt sınırına ulaştın.', 429)
        existing = {str(i.pk): i for i in m.images.all()} if m else {}
        prepared = {}
        try:
            for k in order:
                if k in existing:
                    continue
                if k not in request.FILES or Media.objects.filter(pk=k).exists():
                    return error('Fotoğraf bulunamadı. Yeniden seç.')
                prepared[k] = image_bytes(request.FILES[k])
        except ValueError as exc:
            return error(str(exc))
        if sum(len(existing[k].data) if k in existing else len(prepared[k][0]) for k in order) > 40 * 1024 * 1024:
            return error('Anıdaki fotoğrafların toplamı 40 MB sınırını aşıyor.')
        if not m:
            m = Memory(id=entry_id, owner=request.user)
        m.title, m.body, m.date = title, body, day
        m.location, m.category, m.visibility = f.get('location', '').strip(), f['category'], f['visibility']
        m.album, m.is_draft, m.revision = album, action == 'draft', revision + 1
        if publishing:
            m.created = timezone.now()
        m.save()
        m.images.exclude(pk__in=order).delete()
        for position, k in enumerate(order):
            if k in existing:
                Media.objects.filter(pk=k).update(position=position)
            else:
                content, mime = prepared[k]
                Media.objects.create(id=k, owner=request.user, memory=m, data=content, content_type=mime, position=position)
    return JsonResponse({'id': str(m.pk), 'revision': m.revision, 'draft': m.is_draft}, status=201 if creating else 200)
