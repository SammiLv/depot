import type { RoleType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { resolvePermissionCoverage, type ResolvedPermissionCoverage } from "@/server/permissions/permission-resolver";
import { orgPermissionModuleKeys, talentAbilityKeys } from "@/server/permissions/permission-constants";
import { findNearestDepartmentOrgNodeId, getDescendantOrgNodeIds } from "@/server/organization/org-tree-utils";

type Viewer = { id: string; roleType: RoleType; orgNodeId: string | null };

// 本人视角（只有 SELF 授权、无任何组织范围）：盘点确认前不能看自己的盘点结果。
function isSelfOnlyView(coverage: ResolvedPermissionCoverage) {
  return coverage.hasPermission && !coverage.hasAllAccess && !coverage.hasSubtreeAccess && coverage.orgNodeIds.length === 0 && coverage.includesSelf;
}

async function authorizedDepartments(viewer: Viewer, abilityKey: (typeof talentAbilityKeys)[keyof typeof talentAbilityKeys]) {
  const coverage = await resolvePermissionCoverage(viewer, orgPermissionModuleKeys.talent, abilityKey);
  if (!coverage.hasPermission) return [];
  if (coverage.hasAllAccess) return prisma.orgNode.findMany({ where: { nodeType: "DEPARTMENT" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const sourceIds = [...coverage.orgNodeIds, ...(coverage.includesSelf && viewer.orgNodeId ? [viewer.orgNodeId] : [])];
  const departmentIds = [...new Set((await Promise.all(sourceIds.map((id) => findNearestDepartmentOrgNodeId(id)))).filter((id): id is string => Boolean(id)))];
  return prisma.orgNode.findMany({ where: { nodeType: "DEPARTMENT", id: { in: departmentIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export async function getTalentReviewConfig(viewer: Viewer) {
  const departments = await authorizedDepartments(viewer, talentAbilityKeys.viewConfig);
  const templates = await prisma.talentReviewTemplateVersion.findMany({ where: { departmentOrgNodeId: { in: departments.map((row) => row.id) }, deletedAt: null }, orderBy: [{ createdAt: "desc" }] });
  const templateIds = templates.map((row) => row.id);
  const [dimensions, ratings, thresholds, nineBoxRules] = await Promise.all([
    prisma.talentReviewDimension.findMany({ where: { templateVersionId: { in: templateIds } }, orderBy: { sortOrder: "asc" } }),
    prisma.talentRatingOption.findMany({ where: { templateVersionId: { in: templateIds } }, orderBy: { sortOrder: "asc" } }),
    prisma.talentGradeThreshold.findMany({ where: { templateVersionId: { in: templateIds } }, orderBy: { sortOrder: "asc" } }),
    prisma.talentNineBoxRule.findMany({ where: { templateVersionId: { in: templateIds } }, orderBy: { sortOrder: "asc" } }),
  ]);
  return { departments, templates, dimensions, ratings, thresholds, nineBoxRules };
}

export async function getTalentReviewCycles(viewer: Viewer) {
  const [viewPermission, calibratePermission] = await Promise.all([
    resolvePermissionCoverage(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.viewReview),
    resolvePermissionCoverage(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.calibrateReview),
  ]);
  const departments = await authorizedDepartments(viewer, talentAbilityKeys.viewReview);
  const allCycles = await prisma.talentReviewCycle.findMany({ where: { departmentOrgNodeId: { in: departments.map((row) => row.id) }, deletedAt: null }, orderBy: [{ year: "desc" }, { halfYear: "desc" }, { createdAt: "desc" }] });
  const allParticipants = await prisma.talentReviewParticipant.findMany({ where: { cycleId: { in: allCycles.map((row) => row.id) } } });
  // 历史导入的参与人可能缺少组织快照，回退到用户当前所属组织参与范围匹配
  const participantOrgByUserId = new Map(
    (await prisma.user.findMany({
      where: { id: { in: [...new Set(allParticipants.map((row) => row.userId))] } },
      select: { id: true, orgNodeId: true },
    })).map((row) => [row.id, row.orgNodeId]),
  );
  const participantOrgNodeId = (row: (typeof allParticipants)[number]) =>
    row.orgNodeIdSnapshot ?? participantOrgByUserId.get(row.userId) ?? null;
  // 本人视角只保留本人已确认的盘点记录；未确认的批次对本人不可见。
  const selfOnly = isSelfOnlyView(viewPermission);
  // 范围/进度按查看权限收口：管理员/主管看部门全量，组长只看本组成员，组员只看本人。
  let participants = allParticipants;
  let scopeName: string | null = null;
  if (selfOnly) {
    participants = allParticipants.filter((row) => row.userId === viewer.id && row.status === "CONFIRMED");
    scopeName = "本人";
  } else if (!viewPermission.hasAllAccess && !viewPermission.hasSubtreeAccess) {
    const scopedNodeIds = new Set(viewPermission.orgNodeIds);
    participants = allParticipants.filter((row) => {
      const nodeId = participantOrgNodeId(row);
      return (nodeId ? scopedNodeIds.has(nodeId) : false)
        || (viewPermission.includesSelf && row.userId === viewer.id);
    });
    const scopeNodes = viewPermission.orgNodeIds.length
      ? await prisma.orgNode.findMany({ where: { id: { in: viewPermission.orgNodeIds } }, select: { name: true } })
      : [];
    scopeName = scopeNodes.map((node) => node.name).join("、") || (viewPermission.includesSelf ? "本人" : null);
  }
  const cycles = selfOnly ? allCycles.filter((row) => participants.some((participant) => participant.cycleId === row.id)) : allCycles;
  const templates = await prisma.talentReviewTemplateVersion.findMany({ where: { id: { in: cycles.map((row) => row.templateVersionId) } }, select: { id: true, name: true, version: true } });
  const departmentScopes = await Promise.all(departments.map(async (department) => ({ department, orgNodeIds: await getDescendantOrgNodeIds(department.id) })));
  const candidateOrgNodeIds = [...new Set(departmentScopes.flatMap((item) => item.orgNodeIds))];
  const [candidateRows, orgNodes] = await Promise.all([
    prisma.user.findMany({ where: { orgNodeId: { in: candidateOrgNodeIds }, roleType: { in: ["TEAM_LEADER", "MEMBER"] }, isActive: true, deletedAt: null }, select: { id: true, name: true, title: true, roleType: true, orgNodeId: true }, orderBy: { name: "asc" } }),
    prisma.orgNode.findMany({ where: { id: { in: candidateOrgNodeIds } }, select: { id: true, name: true } }),
  ]);
  const orgNameById = new Map(orgNodes.map((row) => [row.id, row.name]));
  const candidates = candidateRows.map((row) => ({
    ...row,
    orgNodeName: row.orgNodeId ? orgNameById.get(row.orgNodeId) ?? "未配置组织" : "未配置组织",
    departmentOrgNodeId: departmentScopes.find((item) => row.orgNodeId && item.orgNodeIds.includes(row.orgNodeId))?.department.id ?? "",
  }));
  return { departments, cycles, participants, templates, candidates: selfOnly ? [] : candidates, canCreateCycle: calibratePermission.hasPermission, scopeName };
}

export async function getTalentReviewCycleDetail(viewer: Viewer, cycleId: string) {
  const [viewPermission, managePermission, calibratePermission] = await Promise.all([
    resolvePermissionCoverage(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.viewReview),
    resolvePermissionCoverage(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.manageReview),
    resolvePermissionCoverage(viewer, orgPermissionModuleKeys.talent, talentAbilityKeys.calibrateReview),
  ]);
  const departments = await authorizedDepartments(viewer, talentAbilityKeys.viewReview);
  const cycle = await prisma.talentReviewCycle.findFirst({ where: { id: cycleId, departmentOrgNodeId: { in: departments.map((row) => row.id) }, deletedAt: null } });
  if (!cycle) return null;
  const selfOnly = isSelfOnlyView(viewPermission);
  const scoped = !(viewPermission.hasAllAccess || viewPermission.hasSubtreeAccess);
  const [template, dimensions, ratings, thresholds, nineBoxRules, allCycleParticipants] = await Promise.all([
    prisma.talentReviewTemplateVersion.findUnique({ where: { id: cycle.templateVersionId } }),
    prisma.talentReviewDimension.findMany({ where: { templateVersionId: cycle.templateVersionId }, orderBy: { sortOrder: "asc" } }),
    prisma.talentRatingOption.findMany({ where: { templateVersionId: cycle.templateVersionId }, orderBy: { sortOrder: "asc" } }),
    prisma.talentGradeThreshold.findMany({ where: { templateVersionId: cycle.templateVersionId }, orderBy: { sortOrder: "asc" } }),
    prisma.talentNineBoxRule.findMany({ where: { templateVersionId: cycle.templateVersionId }, orderBy: { sortOrder: "asc" } }),
    prisma.talentReviewParticipant.findMany({ where: { cycleId }, orderBy: { createdAt: "asc" } }),
  ]);
  // 组织范围过滤放在内存中：历史导入数据可能没有 orgNodeIdSnapshot，需回退到用户当前所属组织
  let participants = allCycleParticipants;
  if (scoped) {
    const orgByUserId = new Map(
      (await prisma.user.findMany({
        where: { id: { in: [...new Set(allCycleParticipants.map((row) => row.userId))] } },
        select: { id: true, orgNodeId: true },
      })).map((row) => [row.id, row.orgNodeId]),
    );
    participants = allCycleParticipants.filter((row) => {
      const nodeId = row.orgNodeIdSnapshot ?? orgByUserId.get(row.userId) ?? null;
      const inOrgScope = nodeId ? viewPermission.orgNodeIds.includes(nodeId) : false;
      const isSelf = viewPermission.includesSelf && row.userId === viewer.id;
      // 本人视角追加确认状态闸：只返回已确认的盘点记录
      return (inOrgScope || isSelf) && (!selfOnly || row.status === "CONFIRMED");
    });
  }
  const participantIds = participants.map((row) => row.id);
  const [users, dimensionResults, results] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: participants.map((row) => row.userId) } }, select: { id: true, name: true, title: true } }),
    prisma.talentReviewDimensionResult.findMany({ where: { participantId: { in: participantIds } } }),
    prisma.talentReviewResult.findMany({ where: { participantId: { in: participantIds } } }),
  ]);
  return { cycle, template, dimensions, ratings, thresholds, nineBoxRules, participants, users, dimensionResults, results, canManage: managePermission.hasPermission, canCalibrate: calibratePermission.hasPermission };
}
