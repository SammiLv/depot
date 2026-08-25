"use client";

import { Suspense } from "react";
import { TabPanelLoadingSkeleton } from "@/components/page-loading-skeleton";
import { TalentWorkspaceShell } from "./talent-shell";
import type { Section } from "./content";

export function TalentSectionPage({
  visibleSections,
  activeSection,
  children,
}: {
  visibleSections: Section[];
  activeSection: Section;
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<TabPanelLoadingSkeleton />}>
      <TalentWorkspaceShell visibleSections={visibleSections} activeSection={activeSection}>
        {children}
      </TalentWorkspaceShell>
    </Suspense>
  );
}
