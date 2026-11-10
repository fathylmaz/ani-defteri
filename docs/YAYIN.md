# Kendi sunucunda yayınlama

Bu kurulum kalıcı diski olan bir Linux sunucusu, Docker Compose, bir alan adı ve doğrulama/şifre yenileme mesajlarını gönderebileceğin SMTP hesabı kullanır. Aynı kaynak kodu farklı sağlayıcılarda çalıştırılabilir. Bu dosya bir yayına hazırlık tarifidir. Sunucu hesabı veya alan adı oluşturmaz.

1. Projeyi sunucuda aç ve alan adının DNS kaydını sunucuya yönlendir. 80 ve 443 bağlantı noktalarını aç.
2. `.env.example` dosyasını `.env` adıyla kopyala. `DJANGO_SECRET_KEY` ve `POSTGRES_PASSWORD` için birbirinden farklı rastgele değerler kullan. Örneğin her değer için `openssl rand -hex 48` çalıştır. İlk başlatmadan sonra aynı PostgreSQL birimiyle parolayı değiştirirken veritabanı kullanıcısını da güncellemek gerekir.
3. Aşağıdaki alanları kendi değerlerinle doldur. SMTP parolasını yalnızca sunucudaki `.env` içine yaz.

```dotenv
DEBUG=false
DOMAIN=ani.ornek.com
APP_URL=https://ani.ornek.com
ALLOWED_HOSTS=ani.ornek.com,localhost,127.0.0.1,backend
REQUIRE_EMAIL_VERIFICATION=true
EMAIL_HOST=smtp.ornek.com
EMAIL_PORT=587
EMAIL_USE_TLS=true
EMAIL_HOST_USER=mail-kullanici-adi
EMAIL_HOST_PASSWORD=mail-servisinin-parolasi
DEFAULT_FROM_EMAIL=Anı Defteri <bildirim@ornek.com>
```

4. Sunucudaki proje kökünde başlat.

```sh
docker compose -f compose.yaml -f compose.production.yaml up -d --build --wait
docker compose -f compose.yaml -f compose.production.yaml ps
docker compose exec backend python manage.py check --deploy
```

Caddy HTTPS sertifikasını alır, web uygulamasına iletir. API ve PostgreSQL internete ayrı bir port açmaz. Sağlık kontrolü alan adındaki yapılandırmaya göre çalışır. Test için oluşturduğun yeni bir hesapta doğrulama e-postası, giriş, fotoğraflı paylaşım, özel anı ve şifremi unuttum akışlarını gerçek alan adında dene.

5. İki yeni test hesabıyla taslak gizliliği, fotoğraf düzenleme, albüm/takvim ve yalnızca sahibine görünen yıldönümü kontrollerini tamamla. Eski kullanıcıları aktarma. PostgreSQL yedeği alıp boş bir veritabanında geri yüklemeyi dene. Ardından yeni site adresini paylaş.

Yerel ve üretim ortamları ayrı veri tabanı ve anahtarlar kullanmalıdır. Örnek anahtarları veya yerel test oturumlarını üretime taşıma. Kullanıcı tablosu, oturum anahtarları ve parola özetleri yedekte bulunduğundan yedekleri herkese açık bir dizinde tutma.
