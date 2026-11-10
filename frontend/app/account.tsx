import { useState } from "react";
import { BookOpen, ArrowRight } from "lucide-react";
import { api } from "./api";
const labels: Record<string, string> = {
  login: "Giriş yap",
  register: "Hesap oluştur",
  forgot: "Şifre yenileme",
  reset: "Yeni şifreni belirle",
  verify: "E-postanı doğrula",
  resend: "Doğrulama bağlantısını gönder",
};
export default function AccountPage() {
  const params = new URLSearchParams(location.search);
  const [mode, setMode] = useState(
    labels[params.get("mode") || ""] ? params.get("mode")! : "login",
  );
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  function switchMode(next: string) {
    setError("");
    setMessage("");
    setMode(next);
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = Object.fromEntries(f);
      if (
        ["register", "reset"].includes(mode) &&
        body.password !== body.confirm
      )
        throw Error("Şifreler aynı olmalı.");
      const r = await api("/api/auth/" + mode, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          uid: params.get("uid"),
          token: params.get("token"),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "İşlem tamamlanamadı.");
      if (data.user) {
        const ret = params.get("next");
        location.assign(ret?.startsWith("/?") ? ret : "/?sayfa=profilim");
        return;
      }
      setMessage(data.message);
      if (["reset", "verify", "register"].includes(mode)) setMode("login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sunucuya ulaşılamadı.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="account-wrap">
      <a className="brand" href="/">
        Anı Defteri<span>✳</span>
      </a>
      <section className="dialog account-panel">
        <div className="eyebrow">
          <BookOpen size={15} /> KİŞİSEL ANI DEFTERİN
        </div>
        <h2>{labels[mode]}</h2>
        <form key={mode} onSubmit={submit}>
          {mode === "register" && (
            <label>
              Kullanıcı adı
              <input
                name="username"
                required
                minLength={3}
                maxLength={24}
                pattern="[a-z][a-z0-9_]{2,23}"
                placeholder="ornek_kullanici"
                autoComplete="username"
              />
            </label>
          )}
          {!["reset", "verify"].includes(mode) && (
            <label>
              E-posta
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </label>
          )}
          {["login", "register", "reset"].includes(mode) && (
            <label>
              Şifre
              <input
                name="password"
                type="password"
                minLength={mode === "login" ? 1 : 10}
                maxLength={128}
                required
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
            </label>
          )}
          {["register", "reset"].includes(mode) && (
            <label>
              Şifre tekrarı
              <input
                name="confirm"
                type="password"
                required
                autoComplete="new-password"
              />
            </label>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {message && (
            <p className="notice" role="status">
              {message}
            </p>
          )}
          <button className="primary submit" disabled={busy}>
            {busy ? "Lütfen bekle…" : labels[mode]}
            <ArrowRight size={16} />
          </button>
        </form>
        <div className="auth-links">
          {mode !== "login" && (
            <button onClick={() => switchMode("login")}>Giriş yap</button>
          )}
          {mode === "login" && (
            <>
              <button onClick={() => switchMode("register")}>
                Yeni hesap oluştur
              </button>
              <button onClick={() => switchMode("forgot")}>
                Şifremi unuttum
              </button>
              <button onClick={() => switchMode("resend")}>
                Doğrulama e-postasını yeniden gönder
              </button>
            </>
          )}
        </div>
      </section>
      <a href="/">← Keşfet’e dön</a>
    </main>
  );
}
