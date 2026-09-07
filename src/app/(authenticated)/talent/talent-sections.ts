import type { Section } from "./content";

export const TALENT_SECTION_TABS: { key: Section; label: string; href: string }[] = [
  { key: "overview", label: "人才总览", href: "/talent" },
  { key: "review", label: "人才盘点", href: "/talent/review" },
  { key: "decision", label: "人才决策", href: "/talent/decision" },
  { key: "history", label: "人才履历", href: "/talent/history" },
  { key: "config", label: "规则配置", href: "/talent/config" },
];

const legacySectionRedirects: Record<string, string> = {
  review: "/talent/review",
  decision: "/talent/decision",
  history: "/talent/history",
  config: "/talent/config",
};

export function resolveLegacyTalentSectionRedirect(section: string | undefined, searchParams: URLSearchParams) {
  const target = section ? legacySectionRedirects[section] : undefined;
  if (!target) return null;
  const params = new URLSearchParams(searchParams.toString());
  params.delete("section");
  params.delete("tab");
  const query = params.toString();
  return query ? `${target}?${query}` : target;
}

export function buildTalentHistoryHref(category?: "profiles" | "promotion" | "contract" | "salary" | "reward") {
  if (!category || category === "profiles") return "/talent/history";
  return `/talent/history?category=${category}`;
}
