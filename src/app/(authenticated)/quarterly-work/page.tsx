import { requireCurrentUser } from "@/server/auth/current-user";
import { getQuarterlyWorkData } from "@/server/quarterly-work/quarterly-work-query";
import { QuarterlyWorkContent } from "./content";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseIntParam(value: string | string[] | undefined) {
  const raw = readParam(value);
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

const workspaceStatuses = ["all", "DELAYED", "NOT_STARTED", "IN_PROGRESS", "LAUNCHED", "COMPLETED", "CLOSED"] as const;

function parseStatusesParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw.filter((item): item is (typeof workspaceStatuses)[number] =>
    (workspaceStatuses as readonly string[]).includes(item),
  );
}

function parsePanelParam(value: string | string[] | undefined) {
  const raw = readParam(value);
  if (raw === "goal" || raw === "project" || raw === "task" || raw === "value") {
    return raw;
  }
  return undefined;
}

export default async function QuarterlyWorkPage({ searchParams }: PageProps) {
  const currentUser = await requireCurrentUser();
  const params = searchParams ? await searchParams : undefined;
  const selectedYear = parseIntParam(params?.year);
  const selectedQuarterRaw = readParam(params?.quarter);
  const selectedQuarter = selectedQuarterRaw === "all" ? "all" : parseIntParam(params?.quarter);
  const viewRaw = readParam(params?.view);
  const projectPanelRaw = readParam(params?.projectPanel);
  const data = await getQuarterlyWorkData(currentUser, {
    selectedYear,
    selectedQuarter,
    goalId: readParam(params?.goalId) ?? undefined,
    // card 也要显式透传：否则服务端回退角色默认（管理员/主管默认列表），导致切换卡片不生效
    view: viewRaw === "list" ? "list" : viewRaw === "card" ? "card" : undefined,
    projectPanel: projectPanelRaw === "value" ? "value" : undefined,
    panel: parsePanelParam(params?.panel),
    status: parseStatusesParam(params?.status),
    orgNodeId: readParam(params?.orgNodeId) ?? null,
    teamId: readParam(params?.teamId) ?? null,
    ownerId: readParam(params?.ownerId) ?? null,
    projectId: readParam(params?.projectId) ?? null,
    workId: readParam(params?.workId) ?? null,
    query: readParam(params?.q) ?? null,
  });
  return <QuarterlyWorkContent data={data} />;
}
