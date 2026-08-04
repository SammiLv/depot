export type PermissionSelectionState = "checked" | "unchecked" | "mixed";

export type PermissionMatrixCell = {
  allowed: boolean;
  source: string;
  inherited: boolean;
  explicit: boolean;
};

export function getPermissionSelectionState(
  cells: Record<string, PermissionMatrixCell>,
  targetKeys: readonly string[],
  lockedKeys: ReadonlySet<string> = new Set(),
): PermissionSelectionState {
  const editableCells = targetKeys
    .filter((key) => !lockedKeys.has(key))
    .map((key) => cells[key])
    .filter((cell): cell is PermissionMatrixCell => Boolean(cell));

  if (editableCells.length === 0 || editableCells.every((cell) => !cell.allowed)) {
    return "unchecked";
  }
  if (editableCells.every((cell) => cell.allowed)) {
    return "checked";
  }
  return "mixed";
}

export function setPermissionCellsAllowed<TCell extends PermissionMatrixCell>(
  cells: Record<string, TCell>,
  targetKeys: readonly string[],
  allowed: boolean,
  source: TCell["source"],
  lockedKeys: ReadonlySet<string> = new Set(),
): Record<string, TCell> {
  let nextCells = cells;

  for (const key of targetKeys) {
    const cell = cells[key];
    if (!cell || lockedKeys.has(key)) continue;

    if (nextCells === cells) nextCells = { ...cells };
    nextCells[key] = {
      ...cell,
      allowed,
      source,
      explicit: true,
      inherited: false,
    };
  }

  return nextCells;
}

export function countPermissionCellChanges(
  initialCells: Record<string, PermissionMatrixCell>,
  draftCells: Record<string, PermissionMatrixCell>,
) {
  const keys = new Set([...Object.keys(initialCells), ...Object.keys(draftCells)]);
  let changes = 0;

  for (const key of keys) {
    const initial = initialCells[key];
    const draft = draftCells[key];
    if (!initial || !draft) {
      changes += 1;
      continue;
    }
    if (
      initial.allowed !== draft.allowed
      || initial.source !== draft.source
      || initial.explicit !== draft.explicit
      || initial.inherited !== draft.inherited
    ) {
      changes += 1;
    }
  }

  return changes;
}

export function countPermissionValueChanges(
  initialCells: Record<string, PermissionMatrixCell>,
  draftCells: Record<string, PermissionMatrixCell>,
) {
  const keys = new Set([...Object.keys(initialCells), ...Object.keys(draftCells)]);
  let changes = 0;

  for (const key of keys) {
    if (initialCells[key]?.allowed !== draftCells[key]?.allowed) changes += 1;
  }

  return changes;
}
