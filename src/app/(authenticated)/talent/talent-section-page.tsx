"use client";

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
    <TalentWorkspaceShell visibleSections={visibleSections} activeSection={activeSection}>
      {children}
    </TalentWorkspaceShell>
  );
}
