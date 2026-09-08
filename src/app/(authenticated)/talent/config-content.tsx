"use client";

import { useState } from "react";
import { TalentConfigWorkbench } from "./content";
import type { ReviewWorkspaceData } from "./review-workspace-types";
import type { CareerWorkspaceData, CompetencyWorkspaceData, TalentDecisionRuleWorkspaceData } from "./operation-workspace-types";

type ConfigKey = "review" | "career" | "competency" | "salary" | "incident" | "kpi-rating" | "decision-rules";

export function TalentConfigPageContent({
  reviewWorkspace,
  career,
  competency,
  decisionRules,
}: {
  reviewWorkspace: ReviewWorkspaceData;
  career: CareerWorkspaceData;
  competency: CompetencyWorkspaceData;
  decisionRules: TalentDecisionRuleWorkspaceData;
}) {
  const [activeConfig, setActiveConfig] = useState<ConfigKey | null>(null);
  const [notice, setNotice] = useState("");

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  }

  return (
    <>
      <TalentConfigWorkbench
        data={reviewWorkspace}
        career={career}
        competency={competency}
        decisionRules={decisionRules}
        activeConfig={activeConfig}
        onSelect={setActiveConfig}
        onBack={() => setActiveConfig(null)}
        onNotice={showNotice}
      />
      {notice ? (
        <div className="fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-xl">
          {notice}
        </div>
      ) : null}
    </>
  );
}
