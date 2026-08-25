"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, PageHeader } from "@/components/ui-kit";
import type { Section } from "./content";
import { TALENT_SECTION_TABS } from "./talent-sections";

export function TalentWorkspaceShell({
  visibleSections,
  activeSection,
  children,
}: {
  visibleSections: Section[];
  activeSection: Section;
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();

  function isActiveTab(key: Section) {
    return key === activeSection;
  }

  function buildHref(href: string) {
    if (href !== "/talent/history") return href;
    const category = searchParams.get("category");
    return category ? `${href}?category=${category}` : href;
  }

  return (
    <Card className="!p-6">
      <PageHeader
        title="人才发展"
        description="人才画像 · 人才盘点 · 人才决策"
      />

      <div className="mb-5 flex items-center gap-1 overflow-x-auto border-b border-border">
        {TALENT_SECTION_TABS.filter(({ key }) => visibleSections.includes(key)).map(({ key, label, href }) => (
          <Link
            key={key}
            href={buildHref(href)}
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm transition-colors ${
              isActiveTab(key)
                ? "border-primary font-medium text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {visibleSections.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">暂无人才发展模块的访问权限，请联系管理员开通</div>
      ) : (
        children
      )}
    </Card>
  );
}
