import { EntryEditor } from "./entry-editor";
import { Notebook, Anniversary } from "./notebook";
import { pending } from "./draft-cache";
import { api } from "./api";
import { useState, useEffect } from "react";
import { viewFromSearch, viewUrl } from "./navigation";
import { Gallery, photoKeys } from "./photo-gallery";
import { Avatar } from "./profile-editor";
import { Community } from "./community";
import {
  BookOpen,
  Compass,
  Search,
  Plus,
  ArrowUpRight,
  MapPin,
  Bookmark,
  X,
  Camera,
  Lock,
  Globe,
  ArrowRight,
  Feather,
  Heart,
  Trash2,
} from "lucide-react";
type Memory = {
  avatar?: string;
  photos?: string;
  username?: string;
  id: string;
  owner: string;
  author: string;
  title: string;
  body: string;
  date: string;
  location: string;
  category: string;
  visibility: string;
  photo: string | null;
  image?: string;
  images?: string[];
};
const photos = [
  "photo-1476514525535-07fb3b4ae5f1",
  "photo-1464822759023-fed622ff2c3b",
  "photo-1441974231531-c6227db76b6e",
];
const img = (id: string, _w?: number) => "/photos/" + id + ".jpg";
const cats = [
  "Tüm anılar",
  "Seyahat",
  "Doğa",
  "Sevdiklerim",
  "Küçük mutluluklar",
  "Özel günler",
];
export default function Journal() {
  const [editing, setEditing] = useState<any>(null),
    [entries, setEntries] = useState<any[]>([]),
    [albums, setAlbums] = useState<any[]>([]),
    [history, setHistory] = useState<any[]>([]),
    [bookTab, setBookTab] = useState("Anılar");
  const [profile, setProfile] = useState<string | null>(null),
    [following, setFollowing] = useState<string[]>([]),
    [page, setPage] = useState("Keşfet"),
    [category, setCategory] = useState("Tüm anılar"),
    [search, setSearch] = useState(""),
    [memories, setMemories] = useState<Memory[]>([]),
    [user, setUser] = useState<any>(null),
    [modal, setModal] = useState(false),
    [detail, setDetail] = useState<Memory | null>(null),
    [saved, setSaved] = useState<string[]>([]),
    [notice, setNotice] = useState(""),
    [loaded, setLoaded] = useState(false);
  async function load() {
    try {
      const r = await api("/api/memories");
      if (!r.ok) throw Error();
      const d: any = await r.json();
      setMemories(d.memories);
      setSaved(d.saved || []);
      setUser(d.user);
      setFollowing(d.following || []);
      if (d.user) {
        const [bookResponse, historyResponse] = await Promise.all([
          api("/api/notebook"),
          api("/api/anniversaries"),
        ]);
        if (!bookResponse.ok || !historyResponse.ok) throw Error();
        const book = await bookResponse.json(),
          past = await historyResponse.json();
        const cached = await pending(d.user.id).catch(() => []);
        const merged = [...book.entries];
        for (const item of cached) {
          const at = merged.findIndex((x: any) => x.id === item.id);
          if (at < 0) merged.unshift({ ...item, owner: d.user.id });
          else if (merged[at].draft && merged[at].revision <= item.revision)
            merged[at] = { ...merged[at], ...item };
        }
        setEntries(merged);
        setAlbums(book.albums);
        setHistory(past.items);
      } else {
        setEntries([]);
        setAlbums([]);
        setHistory([]);
      }
    } catch {
      setNotice("Anılar şu anda yüklenemedi. Lütfen yeniden dene.");
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function bookmark(id: string) {
    if (!user) {
      location.assign("/hesap");
      return;
    }
    try {
      const existing = saved.includes(id);
      const r = await api("/api/saved", {
        method: existing ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) throw Error();
      setSaved((prev) =>
        existing ? prev.filter((x) => x !== id) : [...new Set([...prev, id])],
      );
    } catch {
      setNotice("Yer imi kaydedilemedi. Yeniden dene.");
    }
  }
  function changeView(p: string, profileName: string | null = null) {
    const url = viewUrl(p, profileName);
    if (window.location.pathname + window.location.search !== url)
      window.history.pushState(null, "", url);
    setProfile(profileName);
    setPage(p);
    setCategory("Tüm anılar");
    setSearch("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function navigate(p: string) {
    changeView(p);
  }
  function begin(entry: any) {
    setEditing(entry);
    setDetail(null);
    setModal(true);
  }
  function compose() {
    begin(null);
  }
  function openProfile(username: string) {
    changeView("Kullanıcılar", username);
  }
  useEffect(() => {
    function restore() {
      const v = viewFromSearch(window.location.search);
      setPage(v.page);
      setProfile(v.profile);
      setSearch("");
      setCategory("Tüm anılar");
      window.scrollTo({ top: 0, behavior: "instant" });
    }
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    if (!modal && !detail) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function key(e: KeyboardEvent) {
      if (e.key === "Escape" && (!modal || !user)) {
        setModal(false);
        setDetail(null);
      }
    }
    window.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      window.removeEventListener("keydown", key);
    };
  }, [modal, detail, user]);
  const all = memories;
  const filtered = all.filter(
    (m) =>
      (page === "Takip ettiklerim"
        ? following.includes(m.owner) && m.visibility === "public"
        : page === "Anı defterim"
          ? m.owner === user?.id
          : page === "Kaydettiklerim"
            ? saved.includes(m.id)
            : m.visibility === "public") &&
      (category === "Tüm anılar" || m.category === category) &&
      `${m.title} ${m.body} ${m.location} ${m.author}`
        .toLocaleLowerCase("tr")
        .includes(search.toLocaleLowerCase("tr")),
  );
  const photo = (m: Memory) =>
    m.image || (m.photo ? "/api/photo?id=" + m.photo : "");
  return (
    <>
      <header>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("Keşfet");
          }}
        >
          Anı Defteri<span>✳</span>
        </a>
        <nav>
          {[
            "Keşfet",
            "Takip ettiklerim",
            "Kullanıcılar",
            "Anı defterim",
            "Kaydettiklerim",
          ].map((p) => (
            <button
              className={
                page === p && !(profile && profile === user?.username)
                  ? "active"
                  : ""
              }
              aria-current={page === p && !profile ? "page" : undefined}
              key={p}
              onClick={() => navigate(p)}
            >
              {p}
            </button>
          ))}
        </nav>
        <div className="header-right">
          <button className="primary" onClick={compose}>
            <Plus size={17} /> Anı ekle
          </button>
          <button
            className="avatar"
            aria-label="Profilim"
            title="Profilim"
            onClick={() => navigate("Profilim")}
          >
            {user ? (
              <Avatar id={user.avatar} label={user.name} />
            ) : (
              <BookOpen size={19} />
            )}
          </button>
        </div>
      </header>
      <main className={page === "Keşfet" ? "home-view" : "section-view"}>
        {page === "Keşfet" && (
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">
                <span /> HAYAT, HATIRLADIĞIN ANLARDIR.
              </div>
              <h1>
                Bazı anlar,
                <br />
                <em>hep bizimle kalır.</em>
              </h1>
              <p>
                Küçük mutluluklar, büyük yolculuklar, unutulmaz insanlar.
                <br className="desktop" /> Anılarını biriktir, hikâyeni paylaş.
                Burası senin anı defterin.
              </p>
              <button className="primary large" onClick={compose}>
                <Feather size={18} /> Bir anı bırak <ArrowUpRight size={18} />
              </button>
              <div className="hero-note">
                <span className="tiny-heart">♡</span> Çünkü güzel anılar,
                paylaştıkça çoğalır.
              </div>
            </div>
            <div className="hero-art">
              <div className="orbit" />
              <span className="spark one">✳</span>
              <span className="spark two">✧</span>
              <div className="polaroid back">
                <img
                  src={img("photo-1500534623283-312aade485b7", 700)}
                  alt="Güneşli bir doğa manzarası"
                />
                <div>yol bizi nereye götürürse…</div>
              </div>
              <div className="polaroid front">
                <span className="tape" />
                <img
                  src={img(photos[0], 800)}
                  alt="Göl kıyısında unutulmaz bir yaz günü"
                />
                <div>bir yaz günü, hep aklımda ♡</div>
              </div>
              <span className="hand-note">İyi ki yaşadım dediğin anlar.</span>
            </div>
          </section>
        )}
        {page === "Keşfet" && user && (
          <Anniversary items={history} open={setDetail} />
        )}
        <section className="feed">
          {page === "Anı defterim" && user ? (
            <>
              {notice && (
                <div className="notice" role="status">
                  {notice}
                  <button
                    aria-label="Bildirimi kapat"
                    onClick={() => setNotice("")}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              <Notebook
                owner={user.id}
                entries={entries}
                albums={albums}
                open={setDetail}
                edit={begin}
                reload={load}
                tab={bookTab}
                setTab={setBookTab}
              />
            </>
          ) : page === "Profilim" && !user ? (
            <div className="profile-signin empty">
              <BookOpen size={38} />
              <h2>Senin profilin, senin hikâyen.</h2>
              <p>
                {loaded
                  ? "Profilini düzenlemek ve anılarını biriktirmek için giriş yap."
                  : "Profilin yükleniyor…"}
              </p>
              {loaded && (
                <a
                  className="primary"
                  href="/hesap?next=%2F%3Fsayfa%3Dprofilim"
                  target="_top"
                >
                  Giriş yap <ArrowRight size={16} />
                </a>
              )}
            </div>
          ) : page === "Kullanıcılar" || page === "Profilim" ? (
            <Community
              key={
                page === "Profilim" ? user?.username : profile || "directory"
              }
              username={page === "Profilim" ? user?.username : profile}
              user={user}
              onOpen={openProfile}
              onMemory={setDetail}
              onChanged={load}
              onClose={() => navigate("Kullanıcılar")}
            />
          ) : (
            <>
              <div className="section-heading">
                <div>
                  <div className="eyebrow">HER HİKÂYE BİR İZ BIRAKIR</div>
                  <h2>
                    {page === "Keşfet"
                      ? "Hayattan birikenler"
                      : page === "Takip ettiklerim"
                        ? "Takip ettiğin hikâyeler"
                        : page === "Anı defterim"
                          ? "Senin hikâyen, senin defterin."
                          : "Yeniden dönmek istediklerin"}
                  </h2>
                </div>
                <div className="search">
                  <Search size={17} />
                  <input
                    aria-label="Anılarda ara"
                    placeholder="Bir anı, bir yer, bir duygu ara…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="filter-row">
                <div className="filters">
                  {cats.map((c, i) => (
                    <button
                      key={c}
                      className={category === c ? "selected" : ""}
                      onClick={() => setCategory(c)}
                    >
                      {i === 0 && <Compass size={15} />} {c}
                    </button>
                  ))}
                </div>
                <span className="sort">En yeni anılar ↓</span>
              </div>
              {notice && (
                <div className="notice" role="status">
                  {notice}
                  <button
                    aria-label="Bildirimi kapat"
                    onClick={() => setNotice("")}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {page === "Anı defterim" && (
                <div className="journal-banner">
                  <BookOpen />
                  <div>
                    <strong>
                      {user
                        ? user.name + " adlı kişinin anı defteri"
                        : "Kendi hikâyene bir sayfa aç."}
                    </strong>
                    <p>
                      {user
                        ? `${memories.filter((m) => m.owner === user.id).length} anı · @${user.username || "kullanıcı"}`
                        : "Anılarını güvenle saklamak için e-posta ve şifrenle giriş yap."}
                    </p>
                  </div>
                  {!user && (
                    <a className="primary" href="/hesap" target="_top">
                      Giriş yap <ArrowRight size={16} />
                    </a>
                  )}
                </div>
              )}
              <div className="grid">
                {filtered.map((m) => (
                  <article key={m.id} className="card">
                    <button
                      className={"card-image " + (!photo(m) ? "no-photo" : "")}
                      onClick={() => setDetail(m)}
                      aria-label={m.title}
                    >
                      {photo(m) ? (
                        <img src={photo(m)} alt={m.title} />
                      ) : (
                        <Feather size={48} />
                      )}
                      <span className="category">{m.category}</span>
                      {(m.images?.length || photoKeys(m).length) > 1 && (
                        <span className="photo-count">
                          ▧ {m.images?.length || photoKeys(m).length}
                        </span>
                      )}
                      {m.owner === "demo" && (
                        <span className="sample">Örnek anı</span>
                      )}
                    </button>
                    <div className="card-body">
                      <div className="meta">
                        <MapPin size={12} />
                        {m.location || "Bir an, bir yerde"}
                        <span>·</span>
                        {new Date(m.date + "T12:00:00").toLocaleDateString(
                          "tr-TR",
                          { day: "numeric", month: "short" },
                        )}
                      </div>
                      <button className="title" onClick={() => setDetail(m)}>
                        <h3>{m.title}</h3>
                      </button>
                      <p>{m.body}</p>
                      <div className="card-footer">
                        <button
                          className="author"
                          onClick={() => {
                            if (m.username) openProfile(m.username);
                            else {
                              setSearch(m.author);
                              setPage("Keşfet");
                            }
                          }}
                        >
                          <span
                            className={"mini-avatar av" + (m.author.length % 3)}
                          >
                            <Avatar
                              id={m.avatar}
                              label={m.username || m.author}
                            />
                          </span>
                          {m.username ? "@" + m.username : m.author}
                        </button>
                        <button
                          className={
                            "bookmark " +
                            (saved.includes(m.id) ? "is-saved" : "")
                          }
                          aria-label="Anıyı kaydet"
                          onClick={() => bookmark(m.id)}
                        >
                          <Bookmark
                            size={18}
                            fill={
                              saved.includes(m.id) ? "currentColor" : "none"
                            }
                          />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {!filtered.length && (
                <div className="empty">
                  <BookOpen size={36} />
                  <h3>
                    {loaded
                      ? "Henüz burada bir anı yok."
                      : "Anılar yükleniyor…"}
                  </h3>
                  <p>
                    {search || category !== "Tüm anılar"
                      ? "Aramanı veya kategori seçimini değiştirebilirsin."
                      : page === "Takip ettiklerim"
                        ? "Kullanıcıları takip ettiğinde paylaştıkları anılar burada görünecek."
                        : page === "Kaydettiklerim"
                          ? "Anılardaki yer imi simgesine dokunarak onları burada biriktirebilirsin."
                          : "Güzel bir başlangıç için tek bir an yeter."}
                  </p>
                  {page === "Takip ettiklerim" ? (
                    <button
                      className="primary"
                      onClick={() => navigate("Kullanıcılar")}
                    >
                      Kullanıcıları keşfet <ArrowRight size={16} />
                    </button>
                  ) : page === "Kaydettiklerim" ? (
                    <button
                      className="primary"
                      onClick={() => navigate("Keşfet")}
                    >
                      Anıları keşfet <Compass size={16} />
                    </button>
                  ) : (
                    <button className="primary" onClick={compose}>
                      İlk anını ekle <Plus size={16} />
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          {page === "Keşfet" && (
            <div className="bottom-note">
              <span>✳</span>
              <p>
                Her gün bir hikâye.
                <br />
                <em>Her hikâye, saklamaya değer.</em>
              </p>
            </div>
          )}
        </section>
      </main>
      <footer>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("Keşfet");
          }}
        >
          Anı Defteri<span>✳</span>
        </a>
        <span>Geçip giden zamanın, kalan güzel yanları.</span>
        <small>Sevgiyle biriktir. © 2026 Anı Defteri</small>
      </footer>
      {modal &&
        (user ? (
          <EntryEditor
            entry={editing}
            owner={user.id}
            albums={albums}
            onDone={async (message: string) => {
              setModal(false);
              setBookTab(message.includes("Taslağın") ? "Taslaklar" : "Anılar");
              navigate("Anı defterim");
              setNotice(message);
              await load();
            }}
            onCancel={() => {
              setModal(false);
              load();
            }}
          />
        ) : (
          <div className="overlay">
            <section
              className="dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Giriş yap"
            >
              <button
                className="close"
                aria-label="Kapat"
                onClick={() => setModal(false)}
              >
                <X />
              </button>
              <h2>Anıların sana ait olsun.</h2>
              <p>Anılarını kaydetmek için hesabınla giriş yap.</p>
              <a className="primary" href="/hesap">
                Giriş yap veya kaydol
              </a>
            </section>
          </div>
        ))}
      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <article
            className="dialog detail"
            role="dialog"
            aria-modal="true"
            aria-label={detail.title}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Kapat"
              onClick={() => setDetail(null)}
            >
              <X />
            </button>
            <Gallery key={detail.id} memory={detail} />
            <div className="eyebrow">
              {detail.category} {detail.owner === "demo" ? " · ÖRNEK ANІ" : ""}
            </div>
            <h2>{detail.title}</h2>
            <div className="meta">
              <button
                className="profile-link"
                onClick={() => {
                  if (detail.username) {
                    openProfile(detail.username);
                    setDetail(null);
                  }
                }}
              >
                {detail.username ? "@" + detail.username : detail.author}
              </button>{" "}
              · {detail.date} · {detail.location}
            </div>
            <p className="story">{detail.body}</p>
            <div className="detail-actions">
              <span className="meta">
                {detail.visibility === "private" ? (
                  <Lock size={15} />
                ) : (
                  <Globe size={15} />
                )}{" "}
                {detail.visibility === "private"
                  ? "Yalnızca sen"
                  : "Herkese açık"}
              </span>
              <button onClick={() => bookmark(detail.id)}>
                <Bookmark size={17} />
                {saved.includes(detail.id) ? "Kaydedildi" : "Kaydet"}
              </button>
              {detail.owner === user?.id && (
                <button onClick={() => begin(detail)}>Düzenle</button>
              )}
              {detail.owner === user?.id && (
                <button
                  onClick={async () => {
                    if (!confirm("Bu anı kalıcı olarak silinsin mi?")) return;
                    const r = await api("/api/memories?id=" + detail.id, {
                      method: "DELETE",
                    });
                    if (r.ok) {
                      setDetail(null);
                      load();
                    } else setNotice("Anı silinemedi. Lütfen yeniden dene.");
                  }}
                >
                  <Trash2 size={17} /> Sil
                </button>
              )}
            </div>
          </article>
        </div>
      )}
    </>
  );
}
