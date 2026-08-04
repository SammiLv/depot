export type KpiApprovalOrgTreeNode = {
  id: string;
  name: string;
  nodeType: "ROOT" | "DEPARTMENT" | "TEAM";
  parentId: string | null;
};

export type KpiApprovalOrgTreeIndex<TNode extends KpiApprovalOrgTreeNode> = {
  nodes: TNode[];
  nodeById: Map<string, TNode>;
  originalParentById: Map<string, string | null>;
  treeParentById: Map<string, string | null>;
  childrenById: Map<string, TNode[]>;
  roots: TNode[];
  scopeNodeIds: Set<string>;
  depthById: Map<string, number>;
  maxDepth: number;
};

function isDescendantOrSelf(
  nodeId: string,
  ancestorId: string,
  parentById: Map<string, string | null>,
) {
  const visited = new Set<string>();
  let currentId: string | null = nodeId;

  while (currentId && !visited.has(currentId)) {
    if (currentId === ancestorId) return true;
    visited.add(currentId);
    currentId = parentById.get(currentId) ?? null;
  }

  return false;
}

export function buildKpiApprovalOrgTreeIndex<TNode extends KpiApprovalOrgTreeNode>(
  nodes: TNode[],
  scopeRootId: string | null,
): KpiApprovalOrgTreeIndex<TNode> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const originalParentById = new Map(nodes.map((node) => [node.id, node.parentId]));
  const effectiveScopeRootId = scopeRootId && nodeById.has(scopeRootId)
    ? scopeRootId
    : nodes.find((node) => node.nodeType === "ROOT")?.id ?? nodes[0]?.id ?? null;
  const scopeNodeIds = new Set(effectiveScopeRootId
    ? nodes
        .filter((node) => isDescendantOrSelf(node.id, effectiveScopeRootId, originalParentById))
        .map((node) => node.id)
    : []);
  const visibleNodeIds = new Set(scopeNodeIds);
  let ancestorId = effectiveScopeRootId
    ? originalParentById.get(effectiveScopeRootId) ?? null
    : null;
  const visitedAncestors = new Set<string>();
  while (ancestorId && !visitedAncestors.has(ancestorId)) {
    visitedAncestors.add(ancestorId);
    visibleNodeIds.add(ancestorId);
    ancestorId = originalParentById.get(ancestorId) ?? null;
  }
  const treeParentById = new Map<string, string | null>();

  for (const node of nodes) {
    if (!visibleNodeIds.has(node.id)) continue;
    if (node.id === effectiveScopeRootId) {
      treeParentById.set(node.id, null);
      continue;
    }

    const parentId = node.parentId;
    const parentIsVisible = parentId ? visibleNodeIds.has(parentId) : false;
    const crossesScopeBoundary = parentId
      ? scopeNodeIds.has(node.id) !== scopeNodeIds.has(parentId)
      : false;
    treeParentById.set(node.id, parentId && parentIsVisible && !crossesScopeBoundary ? parentId : null);
  }

  const childrenById = new Map<string, TNode[]>();
  for (const node of nodes) {
    if (!visibleNodeIds.has(node.id)) continue;
    const parentId = treeParentById.get(node.id) ?? null;
    if (!parentId) continue;
    const children = childrenById.get(parentId) ?? [];
    children.push(node);
    childrenById.set(parentId, children);
  }
  for (const children of childrenById.values()) {
    children.sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"));
  }

  const roots = nodes
    .filter((node) => visibleNodeIds.has(node.id) && !treeParentById.get(node.id))
    .sort((left, right) => {
      if (left.id === effectiveScopeRootId) return -1;
      if (right.id === effectiveScopeRootId) return 1;
      return left.name.localeCompare(right.name, "zh-Hans-CN");
    });
  const depthById = new Map<string, number>();
  let maxDepth = 0;

  if (effectiveScopeRootId) {
    const queue: Array<{ id: string; depth: number }> = [{ id: effectiveScopeRootId, depth: 0 }];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || depthById.has(current.id)) continue;
      depthById.set(current.id, current.depth);
      maxDepth = Math.max(maxDepth, current.depth);
      for (const child of childrenById.get(current.id) ?? []) {
        if (scopeNodeIds.has(child.id)) queue.push({ id: child.id, depth: current.depth + 1 });
      }
    }
  }

  return {
    nodes,
    nodeById,
    originalParentById,
    treeParentById,
    childrenById,
    roots,
    scopeNodeIds,
    depthById,
    maxDepth,
  };
}

export function getKpiApprovalOrgNodeIdsAtDepth(
  index: KpiApprovalOrgTreeIndex<KpiApprovalOrgTreeNode>,
  depth: number,
) {
  return [...index.depthById.entries()]
    .filter(([, nodeDepth]) => nodeDepth === depth)
    .map(([nodeId]) => nodeId);
}

export function getKpiApprovalDepartmentNodeIds(
  index: KpiApprovalOrgTreeIndex<KpiApprovalOrgTreeNode>,
) {
  return index.nodes
    .filter((node) => index.scopeNodeIds.has(node.id) && node.nodeType === "DEPARTMENT")
    .map((node) => node.id);
}

export function getKpiApprovalLeafNodeIds(
  index: KpiApprovalOrgTreeIndex<KpiApprovalOrgTreeNode>,
) {
  return index.nodes
    .filter((node) => index.scopeNodeIds.has(node.id))
    .filter((node) => (index.childrenById.get(node.id) ?? []).every((child) => !index.scopeNodeIds.has(child.id)))
    .map((node) => node.id);
}

function areRelated(
  leftId: string,
  rightId: string,
  parentById: Map<string, string | null>,
) {
  return isDescendantOrSelf(leftId, rightId, parentById)
    || isDescendantOrSelf(rightId, leftId, parentById);
}

export function selectKpiApprovalOrgNodes(
  currentIds: string[],
  requestedIds: string[],
  index: KpiApprovalOrgTreeIndex<KpiApprovalOrgTreeNode>,
) {
  const validCurrentIds = [...new Set(currentIds)].filter((id) => index.nodeById.has(id));
  const requestedSelection: string[] = [];

  for (const requestedId of [...new Set(requestedIds)]) {
    if (!index.nodeById.has(requestedId)) continue;
    for (let position = requestedSelection.length - 1; position >= 0; position -= 1) {
      if (areRelated(requestedSelection[position], requestedId, index.originalParentById)) {
        requestedSelection.splice(position, 1);
      }
    }
    requestedSelection.push(requestedId);
  }

  const removedIds = validCurrentIds.filter((currentId) =>
    requestedSelection.some((requestedId) => areRelated(currentId, requestedId, index.originalParentById))
  );
  const selectedIds = [
    ...validCurrentIds.filter((id) => !removedIds.includes(id)),
    ...requestedSelection,
  ];

  return {
    selectedIds: [...new Set(selectedIds)],
    removedIds: [...new Set(removedIds.filter((id) => !requestedSelection.includes(id)))],
  };
}
