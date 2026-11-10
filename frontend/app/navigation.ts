export const sections: Record<string, string> = {
  Keşfet: "",
  "Takip ettiklerim": "takip",
  Kullanıcılar: "kullanicilar",
  "Anı defterim": "defter",
  Kaydettiklerim: "kaydedilenler",
  Profilim: "profilim",
};
export function viewFromSearch(search: string) {
  const p = new URLSearchParams(search);
  const profile = p.get("profil");
  if (profile) return { page: "Kullanıcılar", profile };
  const page =
    Object.keys(sections).find((k) => sections[k] === p.get("sayfa")) ||
    "Keşfet";
  return { page, profile: null };
}
export function viewUrl(page: string, profile: string | null = null) {
  return profile
    ? "/?profil=" + encodeURIComponent(profile)
    : sections[page]
      ? "/?sayfa=" + sections[page]
      : "/";
}
