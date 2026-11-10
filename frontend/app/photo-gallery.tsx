import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Camera, X } from "lucide-react";
export function photoKeys(memory: any): string[] {
  try {
    const p = JSON.parse(memory.photos || "[]");
    if (Array.isArray(p) && p.length) return p;
  } catch {}
  return memory.photo ? [memory.photo] : [];
}
export function Gallery({ memory }: { memory: any }) {
  const [index, setIndex] = useState(0);
  const urls =
    memory.images ||
    (memory.image
      ? [memory.image]
      : photoKeys(memory).map((k) => "/api/photo?id=" + encodeURIComponent(k)));
  if (!urls.length) return null;
  const move = (n: number) =>
    setIndex((i) => (i + n + urls.length) % urls.length);
  return (
    <div
      className="gallery"
      tabIndex={0}
      aria-label="Anı fotoğrafları"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          move(-1);
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          move(1);
        }
      }}
    >
      <div className="gallery-stage">
        <img
          src={urls[index]}
          alt={`${memory.title} — ${index + 1}. fotoğraf`}
        />
        {urls.length > 1 && (
          <>
            <button
              type="button"
              className="gallery-arrow left"
              aria-label="Önceki fotoğraf"
              onClick={() => move(-1)}
            >
              <ChevronLeft />
            </button>
            <button
              type="button"
              className="gallery-arrow right"
              aria-label="Sonraki fotoğraf"
              onClick={() => move(1)}
            >
              <ChevronRight />
            </button>
          </>
        )}
      </div>
      <div className="gallery-counter" aria-live="polite">
        {index + 1} / {urls.length}
      </div>
    </div>
  );
}
export function PhotoPicker({
  files,
  onChange,
}: {
  files: File[];
  onChange: (f: File[]) => void;
}) {
  const [urls, setUrls] = useState<string[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    const u = files.map((f) => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach(URL.revokeObjectURL);
  }, [files]);
  return (
    <div className="photo-picker">
      <label className="upload">
        <Camera size={25} />
        <span>
          Fotoğraf ekle{" "}
          <small>En fazla 10 fotoğraf · Her biri 8 MB · Toplam 40 MB</small>
        </span>
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const incoming = Array.from(e.target.files || []);
            const next = [...files, ...incoming];
            if (
              next.length > 10 ||
              next.some((f) => f.size > 8388608) ||
              next.reduce((n, f) => n + f.size, 0) > 41943040
            )
              setError(
                "En fazla 10 fotoğraf seç. Her biri 8 MB, toplam 40 MB sınırında olmalı.",
              );
            else if (
              next.some(
                (f) =>
                  !["image/jpeg", "image/png", "image/webp"].includes(f.type),
              )
            )
              setError("JPG, PNG veya WebP fotoğraflar seç.");
            else {
              onChange(next);
              setError("");
            }
            e.target.value = "";
          }}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {files.length > 0 && (
        <>
          <div className="upload-thumbnails">
            {urls.map((url, i) => (
              <div key={url}>
                <img src={url} alt={`${i + 1}. seçilen fotoğraf`} />
                <span>{i === 0 ? "Kapak" : i + 1}</span>
                <button
                  type="button"
                  aria-label={`${i + 1}. fotoğrafı kaldır`}
                  onClick={() => onChange(files.filter((_, n) => n !== i))}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
          <p className="username-hint">
            {files.length} fotoğraf seçildi. İlk fotoğraf anı kartında
            görünecek.
          </p>
        </>
      )}
    </div>
  );
}
