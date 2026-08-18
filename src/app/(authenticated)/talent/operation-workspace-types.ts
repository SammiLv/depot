import type { getBusinessAssessmentPageData } from "@/server/talent/assessment-query";
import type { getTalentHistoryData, getTalentRecommendationData } from "@/server/talent/decision-history-query";
import type { getWorkIncidentPageData } from "@/server/talent/incident-query";
import type { getEmployeeProfileManagementData } from "@/server/talent/employee-profile-query";
import type { getCareerConfiguration, getCompetencyConfiguration } from "@/server/talent/config-query";
import type { getTalentDecisionRuleConfiguration } from "@/server/talent/decision-rule-query";

type JsonValue<T> =
  T extends Date ? string
    : T extends { toJSON(): infer U } ? U
      : T extends Array<infer U> ? Array<JsonValue<U>>
        : T extends object ? { [K in keyof T]: JsonValue<T[K]> }
          : T;

export type AssessmentWorkspaceData = JsonValue<Awaited<ReturnType<typeof getBusinessAssessmentPageData>>>;
export type IncidentWorkspaceData = JsonValue<Awaited<ReturnType<typeof getWorkIncidentPageData>>>;
export type DecisionWorkspaceData = JsonValue<Awaited<ReturnType<typeof getTalentRecommendationData>>>;
export type HistoryWorkspaceData = JsonValue<Awaited<ReturnType<typeof getTalentHistoryData>>>;
export type EmployeeProfileWorkspaceData = JsonValue<Awaited<ReturnType<typeof getEmployeeProfileManagementData>>>;
export type CareerWorkspaceData = JsonValue<Awaited<ReturnType<typeof getCareerConfiguration>>>;
export type CompetencyWorkspaceData = JsonValue<Awaited<ReturnType<typeof getCompetencyConfiguration>>>;
export type TalentDecisionRuleWorkspaceData = JsonValue<Awaited<ReturnType<typeof getTalentDecisionRuleConfiguration>>>;

export type TalentOperationWorkspaceData = {
  assessment: AssessmentWorkspaceData;
  incident: IncidentWorkspaceData;
  decision: DecisionWorkspaceData;
  history: HistoryWorkspaceData;
  employeeProfiles: EmployeeProfileWorkspaceData;
  career: CareerWorkspaceData;
  competency: CompetencyWorkspaceData;
  decisionRules: TalentDecisionRuleWorkspaceData;
};
