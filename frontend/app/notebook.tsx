import { useState } from "react";
import {
  BookOpen,
  Feather,
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { api } from "./api";
import { forget } from "./draft-cache";
import { localDay } from "./entry-editor";
export function Anniversary({ items, open }: any) {
  if (!items.length) return null;
  return (
    <section className="anniversary">
      <div className="eyebrow">SANA ÖZEL BİR HATIRLATMA</div>
      <h2>Bugün, geçmişte</h2>
      <p>Aynı gün, başka bir yıl. Defterinden sana kalanlar.</p>
      <div>
        {items.map((x: any) => (
          <button key={x.memory.id} onClick={() => open(x.memory)}>
            <span>{x.years} yıl önce bugün</span>
            <strong>{x.memory.title}</strong>
            <small>Anıya dön ↗</small>
          </button>
        ))}
      </div>
    </section>
  );
}
export function Notebook({
  owner,
  entries,
  albums,
  open,
  edit,
  reload,
  tab,
  setTab,
}: any) {
  const [query, setQuery] = useState(""),
    [album, setAlbum] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(localDay().slice(0, 7)),
    [day, setDay] = useState("");
  const published = entries.filter((e: any) => !e.draft),
    drafts = entries.filter((e: any) => e.draft);
  const source = tab === "Taslaklar" ? drafts : published;
  const rows = source.filter(
    (e: any) =>
      (tab !== "Albümler" || !album || e.album === album) &&
      (tab !== "Takvim" || e.date.startsWith(day || month)) &&
      `${e.title} ${e.body} ${e.location}`
        .toLocaleLowerCase("tr")
        .includes(query.toLocaleLowerCase("tr")),
  );
  async function create(e: any) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/albums", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setName("");
      setAlbum(d.id);
      await reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function removeAlbum() {
    if (!confirm("Albüm silinsin mi? İçindeki anılar defterinde kalacak."))
      return;
    try {
      const r = await api("/api/albums", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: album }),
      });
      if (!r.ok) throw Error("Albüm silinemedi.");
      setAlbum("");
      await reload();
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function removeDraft(entry: any) {
    if (!confirm("Bu taslak kalıcı olarak silinsin mi?")) return;
    try {
      const r = await api("/api/memories?id=" + entry.id, { method: "DELETE" });
      if (!r.ok && r.status !== 404) throw Error("Taslak silinemedi.");
      await forget(owner, entry.id);
      await reload();
    } catch (e: any) {
      setError(e.message);
    }
  }
  const [year, number] = month.split("-").map(Number);
  const days = new Date(year, number, 0).getDate(),
    offset = (new Date(year, number - 1, 1).getDay() + 6) % 7;
  function shift(delta: number) {
    const d = new Date(year, number - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    setDay("");
  }
  return (
    <section className="notebook">
      <div className="section-heading">
        <div>
          <div className="eyebrow">SANA AİT SAYFALAR</div>
          <h2>Senin hikâyen, senin defterin.</h2>
          <p className="save-status">
            {published.length} anı · {drafts.length} taslak · {albums.length}{" "}
            albüm
          </p>
        </div>
        <button className="primary" onClick={() => edit(null)}>
          <Plus size={16} />
          Anı ekle
        </button>
      </div>
      <div
        className="notebook-tabs"
        role="tablist"
        aria-label="Anı defteri bölümleri"
      >
        {["Anılar", "Taslaklar", "Albümler", "Takvim"].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? "selected" : ""}
            onClick={() => {
              setTab(t);
              setQuery("");
            }}
          >
            {t}
            {t === "Taslaklar" && drafts.length ? ` (${drafts.length})` : ""}
          </button>
        ))}
      </div>
      {tab === "Albümler" && (
        <div className="album-panel">
          <form onSubmit={create}>
            <input
              aria-label="Yeni albüm adı"
              placeholder="Yeni albüm: Üniversite, Yaz tatili…"
              maxLength={80}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="primary" disabled={busy}>
              Albüm oluştur
            </button>
          </form>
          <div className="album-list">
            <button
              className={!album ? "selected" : ""}
              onClick={() => setAlbum("")}
            >
              Tüm anılar
            </button>
            {albums.map((a: any) => (
              <button
                key={a.id}
                className={album === a.id ? "selected" : ""}
                onClick={() => setAlbum(a.id)}
              >
                <BookOpen size={18} />
                {a.name}
                <small>{a.count} sayfa</small>
              </button>
            ))}
          </div>
          {album && (
            <button className="profile-link" onClick={removeAlbum}>
              Seçili albümü sil (anılar kalır)
            </button>
          )}
          <p className="save-status">
            Anını düzenlerken bir albüm seçerek buraya ekleyebilirsin.
            Albümlerin yalnızca sana görünür.
          </p>
        </div>
      )}
      {tab === "Takvim" && (
        <section className="calendar">
          <div className="calendar-heading">
            <button aria-label="Önceki ay" onClick={() => shift(-1)}>
              <ChevronLeft />
            </button>
            <input
              aria-label="Takvim ayı"
              type="month"
              value={month}
              onChange={(e) => {
                if (e.target.value) {
                  setMonth(e.target.value);
                  setDay("");
                }
              }}
            />
            <button aria-label="Sonraki ay" onClick={() => shift(1)}>
              <ChevronRight />
            </button>
          </div>
          <div className="calendar-grid">
            {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((w) => (
              <small key={w}>{w}</small>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={"empty" + i} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const date = month + "-" + String(i + 1).padStart(2, "0"),
                count = published.filter((e: any) => e.date === date).length;
              return (
                <button
                  key={date}
                  aria-label={`${date}, ${count} anı`}
                  className={
                    (date === day ? "selected " : "") +
                    (count ? "has-memory" : "")
                  }
                  onClick={() => setDay(date)}
                >
                  <span>{i + 1}</span>
                  {count > 0 && <small>{count} anı</small>}
                </button>
              );
            })}
          </div>
          {day && (
            <button className="profile-link" onClick={() => setDay("")}>
              Gün seçimini temizle · Ayın tüm anıları
            </button>
          )}
        </section>
      )}
      <div className="notebook-search">
        <input
          aria-label="Defterimde ara"
          placeholder="Defterinde bir anı ara…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span>
          {rows.length} {tab === "Taslaklar" ? "taslak" : "anı"}
        </span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="grid">
        {rows.map((e: any) => (
          <article className="card" key={e.id}>
            <button
              className={"card-image " + (!e.photo ? "no-photo" : "")}
              onClick={() => (e.draft ? edit(e) : open(e))}
              aria-label={e.title || "İsimsiz taslak"}
            >
              {e.photo ? (
                <img src={"/api/photo?id=" + e.photo} alt={e.title} />
              ) : (
                <Feather size={42} />
              )}
              <span className="category">
                {e.draft ? "Taslak" : e.category}
              </span>
            </button>
            <div className="card-body">
              <small className="meta">
                {e.date} ·{" "}
                {e.draft || e.visibility === "private"
                  ? "Yalnızca sen"
                  : "Herkese açık"}
              </small>
              <button
                className="title"
                onClick={() => (e.draft ? edit(e) : open(e))}
              >
                <h3>{e.title || "İsimsiz taslak"}</h3>
              </button>
              <p>{e.body || "Hikâyene kaldığın yerden devam et."}</p>
              <div className="card-footer">
                <button className="profile-link" onClick={() => edit(e)}>
                  {e.draft ? "Yazmaya devam et" : "Düzenle"}
                </button>
                {e.draft && (
                  <button
                    aria-label="Taslağı sil"
                    onClick={() => removeDraft(e)}
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {!rows.length && (
        <div className="empty">
          <BookOpen size={36} />
          <h3>Burada henüz bir sayfa yok.</h3>
          <p>
            {tab === "Taslaklar"
              ? "Yazarken kaydedilen taslakların burada seni bekler."
              : tab === "Takvim"
                ? "Bu tarihte kayıtlı bir anın yok."
                : "Yeni anılarınla defterini doldurabilirsin."}
          </p>
        </div>
      )}
    </section>
  );
}
