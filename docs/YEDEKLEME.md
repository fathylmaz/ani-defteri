# Veritabanı yedekleme


Windows'ta proje dizininden çalıştır.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Yedekle.ps1
```

Bu işlem `backups` içinde PostgreSQL özel biçimli bir yedek üretir. Kullanıcılar, parola özetleri, profil fotoğrafları, anılar ve ilişkiler yedeğe dahildir. Üretim yedeğini korumalı bir konumda sakla. Geri yükleme denemesini boş bir deneme veritabanında yap. Aşağıdaki örnek `ani_defteri_restore_test` veritabanının bulunmadığını varsayar.

```powershell
docker compose cp .\backups\ORNEK.dump db:/tmp/restore.dump
docker compose exec db createdb -U ani_defteri ani_defteri_restore_test
docker compose exec db pg_restore -U ani_defteri --exit-on-error -d ani_defteri_restore_test /tmp/restore.dump
```
