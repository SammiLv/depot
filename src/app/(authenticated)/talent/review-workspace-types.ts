export type ReviewDepartment = { id: string; name: string };
export type ReviewTemplate = {
  id: string; departmentOrgNodeId: string; code: string; name: string; version: number;
  description: string | null; status: string; publishedAt: string | null;
  kpiWeight: number; reviewWeight: number;
};
export type ReviewDimension = { id: string; templateVersionId: string; code: string; name: string; category: string; weight: number; maxScore: number; sortOrder: number; isRequired: boolean };
export type ReviewRating = { id: string; templateVersionId: string; code: string; label: string; numericScore: number; sortOrder: number };
export type ReviewThreshold = { id: string; templateVersionId: string; gradeCode: string; label: string; minScore: number; maxScore: number; sortOrder: number };
export type ReviewNineBox = { id: string; templateVersionId: string; code: string; label: string; potentialMin: number; potentialMax: number; performanceMin: number; performanceMax: number; colorToken: string; sortOrder: number };
export type ReviewCycle = { id: string; year: number; halfYear: number; name: string; departmentOrgNodeId: string; templateVersionId: string; status: string };
export type ReviewParticipant = { id: string; cycleId: string; userId: string; status: string };
export type ReviewCandidate = { id: string; name: string; title: string | null; roleType: string; orgNodeId: string | null; orgNodeName: string; departmentOrgNodeId: string };
export type ReviewUser = { id: string; name: string; title: string | null };
export type ReviewDimensionResult = { participantId: string; dimensionId: string; ratingCode: string };
export type ReviewResult = { participantId: string; totalScore: number; gradeCode: string; nineBoxCode: string | null; talentType: string | null; managerComment: string | null };
export type ReviewCycleDetail = {
  cycleId: string; cycleStatus: string; dimensions: ReviewDimension[]; ratings: ReviewRating[]; thresholds: ReviewThreshold[];
  nineBoxRules: ReviewNineBox[]; participants: ReviewParticipant[]; users: ReviewUser[];
  dimensionResults: ReviewDimensionResult[]; results: ReviewResult[]; canManage: boolean; canCalibrate: boolean;
};
export type ReviewWorkspaceData = {
  config: { departments: ReviewDepartment[]; templates: ReviewTemplate[]; dimensions: ReviewDimension[]; ratings: ReviewRating[]; thresholds: ReviewThreshold[]; nineBoxRules: ReviewNineBox[] };
  cycles: { departments: ReviewDepartment[]; cycles: ReviewCycle[]; participants: ReviewParticipant[]; templates: Pick<ReviewTemplate, "id" | "name" | "version">[]; candidates: ReviewCandidate[]; canCreateCycle: boolean };
  details: ReviewCycleDetail[];
};
