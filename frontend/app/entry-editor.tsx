import { useEffect, useRef, useState } from "react";
import { X, Feather, Camera, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "./api";
import { photoKeys } from "./photo-gallery";
import { remember, forget } from "./draft-cache";
const categories = [
  "Seyahat",
  "Doğa",
  "Sevdiklerim",
  "Küçük mutluluklar",
  "Özel günler",
];
export function localDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function Thumb({ picture }: { picture: any }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!picture.file) {
      setUrl("/api/photo?id=" + picture.id);
      return;
    }
    const src = URL.createObjectURL(picture.file);
    setUrl(src);
    return () => URL.revokeObjectURL(src);
  }, [picture.id, picture.file]);
  return <img src={url || undefined} alt="Seçili fotoğraf" />;
}
export function EntryEditor({ entry, owner, albums, onDone, onCancel }: any) {
  const [form, setForm] = useState<any>(() => ({
    id: entry?.id || crypto.randomUUID(),
    title: entry?.title || "",
    body: entry?.body || "",
    date: entry?.date || localDay(),
    location: entry?.location || "",
    category: entry?.category || "Seyahat",
    visibility: entry?.visibility || "private",
    album: entry?.album || "",
    pictures:
      entry?.pictures || (entry ? photoKeys(entry).map((id) => ({ id })) : []),
  }));
  const published = Boolean(entry && !entry.draft);
  const revision = useRef(entry?.revision || 0),
    latest = useRef(form),
    known = useRef(new Set(entry ? photoKeys(entry) : []));
  const queue = useRef<Promise<any>>(Promise.resolve()),
    changed = useRef(false),
    closing = useRef(false);
  const [status, setStatus] = useState(
    published
      ? "Değişikliklerini kaydetmeyi unutma."
      : "Taslağın yalnızca sana görünür.",
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  function change(patch: any) {
    const value = { ...latest.current, ...patch };
    latest.current = value;
    changed.current = true;
    setForm(value);
    setStatus(
      published
        ? "Kaydedilmemiş değişikliklerin var."
        : "Taslak kaydedilmeyi bekliyor…",
    );
    if (!published)
      void remember(owner, {
        ...value,
        draft: true,
        revision: revision.current,
      }).catch(() =>
        setStatus("Cihaz yedeği oluşturulamadı; sunucu kaydını bekle."),
      );
  }
  function save(action: string) {
    const work = async () => {
      const snapshot = latest.current;
      const data = new FormData();
      for (const key of [
        "title",
        "body",
        "date",
        "location",
        "category",
        "visibility",
        "album",
      ])
        data.set(key, snapshot[key]);
      data.set("action", action);
      data.set("revision", String(revision.current));
      data.set(
        "order",
        JSON.stringify(snapshot.pictures.map((p: any) => p.id)),
      );
      snapshot.pictures.forEach((p: any) => {
        if (p.file && !known.current.has(p.id)) data.set(p.id, p.file);
      });
      setStatus("Kaydediliyor…");
      const res = await api("/api/entries/" + snapshot.id, {
        method: "POST",
        body: data,
      });
      const result = await res.json();
      if (!res.ok) throw Error(result.error || "Kaydedilemedi. Yeniden dene.");
      revision.current = result.revision;
      known.current = new Set(snapshot.pictures.map((p: any) => p.id));
      if (!published) {
        if (action === "publish" || latest.current === snapshot)
          await forget(owner, snapshot.id).catch(() => {});
        else
          await remember(owner, {
            ...latest.current,
            draft: true,
            revision: revision.current,
          }).catch(() => {});
      }
      setStatus(
        action === "draft" ? "Taslağın kaydedildi." : "Anın kaydedildi.",
      );
      setError("");
    };
    const task = queue.current.catch(() => {}).then(work);
    queue.current = task;
    return task;
  }
  useEffect(() => {
    if (published || !changed.current || closing.current) return;
    const timer = setTimeout(() => {
      if (!closing.current)
        void save("draft").catch((e) => setError(e.message));
    }, 750);
    return () => clearTimeout(timer);
  }, [form]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (changed.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);
  async function close() {
    if (busy) return;
    if (published) {
      if (
        changed.current &&
        !confirm("Kaydedilmemiş değişikliklerden vazgeçilsin mi?")
      )
        return;
      onCancel();
      return;
    }
    closing.current = true;
    setBusy(true);
    try {
      if (changed.current) {
        await save("draft");
        onDone("Taslağın kaydedildi.");
      } else onCancel();
    } catch (e: any) {
      setError(e.message);
      closing.current = false;
      setBusy(false);
    }
  }
  async function publish(e: any) {
    e.preventDefault();
    closing.current = true;
    setBusy(true);
    try {
      await save("publish");
      changed.current = false;
      onDone(
        published ? "Anın güncellendi." : "Anın defterindeki yerini aldı.",
      );
    } catch (e: any) {
      setError(e.message);
      closing.current = false;
      setBusy(false);
    }
  }
  function add(files: FileList | null) {
    if (!files) return;
    const pictures = [
      ...latest.current.pictures,
      ...Array.from(files).map((file) => ({ id: crypto.randomUUID(), file })),
    ];
    if (
      pictures.length > 10 ||
      pictures.some((p) => p.file?.size > 8 * 1024 * 1024) ||
      pictures.reduce((n, p) => n + (p.file?.size || 0), 0) > 40 * 1024 * 1024
    ) {
      setError(
        "En fazla 10 fotoğraf; fotoğraf başına 8 MB, toplam 40 MB seçebilirsin.",
      );
      return;
    }
    change({ pictures });
    setError("");
  }
  function move(index: number, delta: number) {
    const pictures = [...form.pictures];
    [pictures[index], pictures[index + delta]] = [
      pictures[index + delta],
      pictures[index],
    ];
    change({ pictures });
  }
  return (
    <div className="overlay">
      <section
        className="dialog entry-editor"
        role="dialog"
        aria-modal="true"
        aria-label={published ? "Anıyı düzenle" : "Yeni anı"}
      >
        <button
          className="close"
          aria-label="Kapat"
          disabled={busy}
          onClick={close}
        >
          <X />
        </button>
        <div className="eyebrow">DEFTERİNDE BİR SAYFA</div>
        <h2>{published ? "Anına yeniden dokun." : "Bugünden bir iz bırak."}</h2>
        <form onSubmit={publish}>
          <fieldset disabled={busy}>
            <label>
              Bu anının adı
              <input
                autoFocus
                value={form.title}
                maxLength={120}
                required
                onChange={(e) => change({ title: e.target.value })}
                placeholder="O günü bir cümleyle anlat…"
              />
            </label>
            <label>
              Hikâyen
              <textarea
                value={form.body}
                rows={5}
                maxLength={10000}
                required
                onChange={(e) => change({ body: e.target.value })}
                placeholder="Neyi hiç unutmak istemiyorsun?"
              />
            </label>
            <div className="form-row">
              <label>
                Tarih
                <input
                  type="date"
                  value={form.date}
                  required
                  onChange={(e) => change({ date: e.target.value })}
                />
              </label>
              <label>
                Konum
                <input
                  value={form.location}
                  maxLength={120}
                  onChange={(e) => change({ location: e.target.value })}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Kategori
                <select
                  aria-label="Kategori"
                  value={form.category}
                  onChange={(e) => change({ category: e.target.value })}
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Kimler görebilir?
                <select
                  aria-label="Kimler görebilir?"
                  value={form.visibility}
                  onChange={(e) => change({ visibility: e.target.value })}
                >
                  <option value="private">Yalnızca ben</option>
                  <option value="public">Herkese açık</option>
                </select>
              </label>
            </div>
            <label>
              Albüm
              <select
                aria-label="Albüm"
                value={form.album}
                onChange={(e) => change({ album: e.target.value })}
              >
                <option value="">Albümsüz</option>
                {albums.map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="upload">
              <Camera />
              <span>
                Fotoğraflar ekle
                <small>
                  JPG, PNG, WebP · En fazla 10 fotoğraf · İlk fotoğraf kapaktır.
                </small>
              </span>
              <input
                aria-label="Fotoğraflar ekle"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) => {
                  add(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="editor-photos">
              {form.pictures.map((p: any, i: number) => (
                <div key={p.id}>
                  <Thumb picture={p} />
                  <small>{i === 0 ? "Kapak" : i + 1}</small>
                  <div>
                    <button
                      type="button"
                      aria-label={`${i + 1}. fotoğrafı sola taşı`}
                      disabled={!i}
                      onClick={() => move(i, -1)}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`${i + 1}. fotoğrafı kaldır`}
                      onClick={() =>
                        change({
                          pictures: form.pictures.filter(
                            (x: any) => x.id !== p.id,
                          ),
                        })
                      }
                    >
                      <X size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`${i + 1}. fotoğrafı sağa taşı`}
                      disabled={i === form.pictures.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="save-status" role="status">
              {status}
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary submit" disabled={busy}>
              <Feather size={16} />
              {busy
                ? "Kaydediliyor…"
                : published
                  ? "Değişiklikleri kaydet"
                  : "Anıyı defterime ekle"}
            </button>
            {!published && (
              <button type="button" className="draft-close" onClick={close}>
                Taslak olarak kaydet ve kapat
              </button>
            )}
          </fieldset>
        </form>
      </section>
    </div>
  );
}
