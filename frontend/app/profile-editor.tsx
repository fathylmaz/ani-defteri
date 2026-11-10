import { api } from "./api";
import { useEffect, useState } from "react";
import { X, Camera, Save } from "lucide-react";
export function Avatar({ id, label }: { id?: string; label: string }) {
  return id ? (
    <img
      className="avatar-photo"
      src={"/api/avatar?id=" + encodeURIComponent(id)}
      alt={label + " profil fotoğrafı"}
    />
  ) : (
    <>{label.slice(0, 1).toUpperCase()}</>
  );
}
export default function ProfileEditor({
  profile,
  onClose,
  onSaved,
}: {
  profile: any;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [remove, setRemove] = useState(false);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="overlay">
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Profili düzenle"
      >
        <button
          type="button"
          className="close"
          aria-label="Düzenlemeyi kapat"
          disabled={busy}
          onClick={onClose}
        >
          <X />
        </button>
        <div className="eyebrow">SENİN HİKÂYEN</div>
        <h2>Profilini kendin gibi yap.</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            f.set("removeAvatar", String(remove));
            if (file) f.set("avatar", file);
            try {
              const r = await api("/api/profiles", { method: "POST", body: f });
              const d: any = await r.json();
              if (!r.ok) throw Error(d.error);
              await onSaved();
              onClose();
            } catch (e: any) {
              setError(e.message || "Profil kaydedilemedi.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="edit-avatar">
            <span className="profile-avatar">
              {preview ? (
                <img
                  className="avatar-photo"
                  src={preview}
                  alt="Yeni profil fotoğrafı"
                />
              ) : (
                <Avatar
                  id={remove ? undefined : profile.avatar}
                  label={profile.username}
                />
              )}
            </span>
            <div>
              <label className="avatar-upload">
                <Camera size={15} /> Fotoğraf seç
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.size > 5242880) {
                        setError("Profil fotoğrafı en fazla 5 MB olabilir.");
                        e.target.value = "";
                        return;
                      }
                      setFile(f);
                      setRemove(false);
                      setError("");
                    }
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                className="remove-avatar"
                onClick={() => {
                  setFile(null);
                  setRemove(true);
                }}
              >
                Fotoğrafı kaldır
              </button>
            </div>
          </div>
          <p className="username-hint">JPG, PNG veya WebP · En fazla 5 MB</p>
          <label>
            Görünen ad
            <input
              name="displayName"
              maxLength={60}
              defaultValue={profile.displayName || ""}
              placeholder="Adın veya kendini tanıttığın isim"
            />
          </label>
          <label>
            Kullanıcı adı
            <input value={"@" + profile.username} readOnly />
          </label>
          <label>
            Hakkımda
            <textarea
              name="bio"
              rows={3}
              maxLength={300}
              defaultValue={profile.bio || ""}
              placeholder="Kendinden, sevdiğin şeylerden ve hikâyenden bahset…"
            />
          </label>
          <div className="form-row">
            <label>
              Instagram kullanıcı adı
              <input
                name="instagram"
                maxLength={30}
                defaultValue={profile.instagram || ""}
                placeholder="kullanici_adi"
              />
            </label>
            <label>
              Web sitesi / sosyal bağlantı
              <input
                name="website"
                type="url"
                maxLength={500}
                defaultValue={profile.website || ""}
                placeholder="https://…"
              />
            </label>
          </div>
          <p className="username-hint">
            Profil bilgilerin ve bağlantıların diğer kullanıcılara görünür.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary submit" disabled={busy}>
            {busy ? "Kaydediliyor…" : "Değişiklikleri kaydet"}
            <Save size={16} />
          </button>
        </form>
      </section>
    </div>
  );
}
