import { api } from "./api";
import { useEffect, useState } from "react";
import ProfileEditor, { Avatar } from "./profile-editor";
import { X, Search, UserPlus, Users, BookOpen, ArrowLeft } from "lucide-react";
export function Community({
  username,
  user,
  onOpen,
  onMemory,
  onChanged,
  onClose,
}: {
  username: string | null;
  user: any;
  onOpen: (s: string) => void;
  onMemory: (m: any) => void;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false),
    [revision, setRevision] = useState(0);
  const [data, setData] = useState<any>(null),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [relation, setRelation] = useState("");
  useEffect(() => {
    setRelation("");
    setQuery("");
  }, [username]);
  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    const timer = setTimeout(() => {
      api(
        "/api/profiles?" +
          (username
            ? "username=" +
              encodeURIComponent(username) +
              "&relation=" +
              relation
            : "q=" + encodeURIComponent(query)),
      )
        .then(async (r) => {
          const d: any = await r.json();
          if (!r.ok) throw Error(d.error);
          if (live) setData(d);
        })
        .catch((e) => live && setError(e.message));
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [username, query, relation, revision]);
  async function follow(p: any) {
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/follows", {
        method: p.isFollowing ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: p.username }),
      });
      const d: any = await r.json();
      if (!r.ok) throw Error(d.error);
      const update = (x: any) =>
        x.username === p.username
          ? {
              ...x,
              isFollowing: !p.isFollowing,
              followers: x.followers + (p.isFollowing ? -1 : 1),
            }
          : x;
      setData((d: any) => ({
        ...d,
        profile: d.profile ? update(d.profile) : undefined,
        profiles: d.profiles?.map(update),
      }));
      await onChanged();
    } catch (e: any) {
      setError(e.message || "İşlem tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  }
  function followButton(p: any) {
    return p.isSelf ? (
      <button className="follow-secondary" onClick={() => setEditing(true)}>
        Profili düzenle
      </button>
    ) : user ? (
      <button
        className={p.isFollowing ? "follow-secondary" : "primary"}
        disabled={busy}
        onClick={() => follow(p)}
      >
        {p.isFollowing ? "Takibi bırak" : "Takip et"}
        <UserPlus size={15} />
      </button>
    ) : (
      <a className="primary" target="_top" href="/hesap">
        Giriş yap ve takip et
      </a>
    );
  }
  return (
    <section className="community">
      <div className="community-heading">
        <div>
          <div className="eyebrow">HİKÂYELERİN ARDINDAKİ İNSANLAR</div>
          <h2>{username ? "@" + username : "Yeni hikâyelerle tanış."}</h2>
        </div>
        {username && (
          <button className="follow-secondary" onClick={onClose}>
            <ArrowLeft size={16} />
            Kullanıcılara dön
          </button>
        )}
      </div>
      {!username && (
        <div className="search people-search">
          <Search size={18} />
          <input
            aria-label="Kullanıcı adı ara"
            placeholder="Kullanıcı adıyla ara…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data && !error && (
        <p className="username-hint">Profiller yükleniyor…</p>
      )}
      {data?.profile && (
        <>
          <div className="profile-summary">
            <span className="profile-avatar">
              <Avatar id={data.profile.avatar} label={username || ""} />
            </span>
            <div>
              <h3>{data.profile.displayName || "@" + username}</h3>
              {data.profile.displayName && (
                <p className="profile-handle">@{username}</p>
              )}
              <div className="profile-stats">
                <span>{data.profile.memoryCount} açık anı</span>
                <button
                  className={relation === "followers" ? "active" : ""}
                  onClick={() =>
                    setRelation(relation === "followers" ? "" : "followers")
                  }
                >
                  {data.profile.followers} takipçi
                </button>
                <button
                  className={relation === "following" ? "active" : ""}
                  onClick={() =>
                    setRelation(relation === "following" ? "" : "following")
                  }
                >
                  {data.profile.following} takip edilen
                </button>
              </div>
            </div>
            {followButton(data.profile)}
          </div>
          {data.profile.isSelf && (
            <div className="account-tools">
              <a href="/api/export" download>
                Defterimi dışa aktar
              </a>
              <button
                onClick={async () => {
                  try {
                    const r = await api("/api/auth/logout", { method: "POST" });
                    if (!r.ok) throw Error();
                    location.assign("/");
                  } catch {
                    setError("Çıkış yapılamadı. Tekrar dene.");
                  }
                }}
              >
                Çıkış yap
              </button>
            </div>
          )}
          {(data.profile.bio ||
            data.profile.instagram ||
            data.profile.website) && (
            <div className="profile-about">
              {data.profile.bio && <p>{data.profile.bio}</p>}
              <div className="social-links">
                {data.profile.instagram && (
                  <a
                    href={
                      "https://www.instagram.com/" +
                      encodeURIComponent(data.profile.instagram) +
                      "/"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Instagram · @{data.profile.instagram} ↗
                  </a>
                )}
                {data.profile.website && (
                  <a
                    href={data.profile.website}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {new URL(data.profile.website).hostname} ↗
                  </a>
                )}
              </div>
            </div>
          )}
          {relation ? (
            <div>
              <h3>
                {relation === "followers" ? "Takipçiler" : "Takip edilenler"}
              </h3>
              <div className="people-list">
                {data.people.map((p: any) => (
                  <button
                    key={p.username}
                    className="person-name"
                    onClick={() => onOpen(p.username)}
                  >
                    @{p.username} →
                  </button>
                ))}
              </div>
              {!data.people.length && <p>Henüz kimse yok.</p>}
            </div>
          ) : (
            <div className="profile-memories">
              {data.memories.map((m: any) => (
                <button
                  className="profile-memory"
                  key={m.id}
                  onClick={() => onMemory(m)}
                >
                  {m.photo ? (
                    <img src={"/api/photo?id=" + m.photo} alt={m.title} />
                  ) : (
                    <BookOpen size={28} />
                  )}
                  <div>
                    <small>
                      {m.date} ·{" "}
                      {m.visibility === "private" ? "Yalnızca sen" : m.category}
                    </small>
                    <h3>{m.title}</h3>
                    <p>{m.body.slice(0, 150)}</p>
                  </div>
                </button>
              ))}
              {!data.memories.length && (
                <div className="empty">
                  <BookOpen />
                  <p>Bu defterde henüz paylaşılmış bir anı yok.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {data?.profiles && (
        <div className="people-list">
          {data.profiles.map((p: any) => (
            <div className="person" key={p.username}>
              <button
                className="person-name"
                onClick={() => onOpen(p.username)}
              >
                <span className="mini-avatar">
                  <Avatar id={p.avatar} label={p.username} />
                </span>
                <span>
                  @{p.username}
                  <small>
                    {p.memoryCount} anı · {p.followers} takipçi
                  </small>
                </span>
              </button>
              {followButton(p)}
            </div>
          ))}
          {!data.profiles.length && (
            <div className="empty">
              <Users />
              <h3>
                {query
                  ? "Bu kullanıcı adıyla kimse bulunamadı."
                  : "İlk hikâyeyi sen başlat."}
              </h3>
              <p>Kullanıcı adı oluşturan kişiler burada görünecek.</p>
            </div>
          )}
        </div>
      )}
      {editing && data?.profile?.isSelf && (
        <ProfileEditor
          profile={data.profile}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            await onChanged();
            setRevision((n) => n + 1);
          }}
        />
      )}
    </section>
  );
}
