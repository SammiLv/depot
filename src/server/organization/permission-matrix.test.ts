import assert from "node:assert/strict";
import test from "node:test";
import {
  countPermissionCellChanges,
  countPermissionValueChanges,
  getPermissionSelectionState,
  setPermissionCellsAllowed,
} from "@/lib/permission-matrix";
import { parseCompletePermissionMatrix } from "./permission-matrix-sync";

const cells = {
  "ADMIN:view": { allowed: true, source: "SYSTEM", explicit: true, inherited: false },
  "ADMIN:manage": { allowed: false, source: "SYSTEM", explicit: true, inherited: false },
  "MEMBER:view": { allowed: false, source: "SYSTEM", explicit: true, inherited: false },
};

test("selection state reports checked, unchecked, and mixed", () => {
  assert.equal(getPermissionSelectionState(cells, ["ADMIN:view"]), "checked");
  assert.equal(getPermissionSelectionState(cells, ["ADMIN:manage", "MEMBER:view"]), "unchecked");
  assert.equal(getPermissionSelectionState(cells, ["ADMIN:view", "ADMIN:manage"]), "mixed");
});

test("locked cells do not participate in selection state", () => {
  assert.equal(
    getPermissionSelectionState(cells, ["ADMIN:view", "ADMIN:manage"], new Set(["ADMIN:view"])),
    "unchecked",
  );
});

test("batch selection updates every editable target without mutating the source", () => {
  const updated = setPermissionCellsAllowed(
    cells,
    ["ADMIN:manage", "MEMBER:view"],
    true,
    "SYSTEM",
  );

  assert.equal(updated["ADMIN:manage"].allowed, true);
  assert.equal(updated["MEMBER:view"].allowed, true);
  assert.equal(cells["ADMIN:manage"].allowed, false);
});

test("batch clearing preserves locked menu cells", () => {
  const updated = setPermissionCellsAllowed(
    cells,
    ["ADMIN:view", "ADMIN:manage"],
    false,
    "SYSTEM",
    new Set(["ADMIN:view"]),
  );

  assert.equal(updated["ADMIN:view"].allowed, true);
  assert.equal(updated["ADMIN:manage"].allowed, false);
});

test("department inherited cells become explicit after a batch change", () => {
  const inheritedCells = {
    "MEMBER:view": { allowed: true, source: "SYSTEM", explicit: false, inherited: true },
  };
  const updated = setPermissionCellsAllowed(
    inheritedCells,
    ["MEMBER:view"],
    false,
    "DEPARTMENT",
  );

  assert.deepEqual(updated["MEMBER:view"], {
    allowed: false,
    source: "DEPARTMENT",
    explicit: true,
    inherited: false,
  });
});

test("a role column can be selected independently", () => {
  const updated = setPermissionCellsAllowed(
    cells,
    ["MEMBER:view"],
    true,
    "SYSTEM",
  );

  assert.equal(updated["MEMBER:view"].allowed, true);
  assert.equal(updated["ADMIN:manage"].allowed, false);
});

test("missing target keys are ignored safely", () => {
  assert.strictEqual(
    setPermissionCellsAllowed(cells, ["UNKNOWN:key"], true, "SYSTEM"),
    cells,
  );
});

test("change counting includes inherited-to-explicit transitions", () => {
  const initial = {
    "MEMBER:view": { allowed: true, source: "SYSTEM", explicit: false, inherited: true },
  };
  const draft = setPermissionCellsAllowed(initial, ["MEMBER:view"], true, "DEPARTMENT");

  assert.equal(countPermissionCellChanges(initial, draft), 1);
  assert.equal(countPermissionCellChanges(initial, initial), 0);
});

test("value change counting ignores metadata-only transitions", () => {
  const initial = { "MEMBER:view": { allowed: true, source: "SYSTEM", explicit: false, inherited: true } };
  const draft = { "MEMBER:view": { allowed: true, source: "DEPARTMENT", explicit: true, inherited: false } };
  assert.equal(countPermissionValueChanges(initial, draft), 0);
});

test("complete matrix parser rejects missing and duplicate cells", () => {
  const oneCell = JSON.stringify([{ roleType: "ADMIN", permissionId: "view", allowed: true }]);
  assert.throws(() => parseCompletePermissionMatrix(oneCell, ["view"]), /不完整/);
  const complete = ["ADMIN", "DEPARTMENT_MANAGER", "TEAM_LEADER", "MEMBER"].map((roleType) => ({ roleType, permissionId: "view", allowed: true }));
  assert.equal(parseCompletePermissionMatrix(JSON.stringify(complete), ["view"]).length, 4);
  assert.throws(() => parseCompletePermissionMatrix(JSON.stringify([...complete, complete[0]]), ["view"]), /重复/);
});
