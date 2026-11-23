import assert from "node:assert/strict";
import test from "node:test";
import { sortResignedMembersLast, sortResignedPoolTeamsLast } from "./org-node-order";

test("sortResignedPoolTeamsLast：离职人员组排最后，其余顺序不变", () => {
  const teams = [
    { id: "a", name: "A 组", isResignedPool: false },
    { id: "pool", name: "离职人员", isResignedPool: true },
    { id: "b", name: "B 组", isResignedPool: false },
  ];
  const sorted = sortResignedPoolTeamsLast(teams);
  assert.deepEqual(sorted.map((team) => team.id), ["a", "b", "pool"]);
});

test("sortResignedPoolTeamsLast：无离职人员组时行为等同原顺序", () => {
  const teams = [
    { id: "b", name: "B 组", isResignedPool: false },
    { id: "a", name: "A 组", isResignedPool: false },
  ];
  const sorted = sortResignedPoolTeamsLast(teams);
  assert.deepEqual(sorted.map((team) => team.id), ["b", "a"]);
});

test("sortResignedPoolTeamsLast：多个池组保持相对顺序，且不修改原数组", () => {
  const teams = [
    { id: "pool1", isResignedPool: true },
    { id: "x", isResignedPool: false },
    { id: "pool2", isResignedPool: true },
  ];
  const sorted = sortResignedPoolTeamsLast(teams);
  assert.deepEqual(sorted.map((team) => team.id), ["x", "pool1", "pool2"]);
  assert.deepEqual(teams.map((team) => team.id), ["pool1", "x", "pool2"]);
});

test("sortResignedMembersLast：离职成员排最后，在职相对顺序不变", () => {
  const members = [
    { id: "u1", isResigned: false },
    { id: "u2", isResigned: true },
    { id: "u3", isResigned: false },
    { id: "u4", isResigned: true },
  ];
  const sorted = sortResignedMembersLast(members);
  assert.deepEqual(sorted.map((member) => member.id), ["u1", "u3", "u2", "u4"]);
});

test("sortResignedMembersLast：全部在职时保持原顺序", () => {
  const members = [{ id: "u2", isResigned: false }, { id: "u1", isResigned: false }];
  const sorted = sortResignedMembersLast(members);
  assert.deepEqual(sorted.map((member) => member.id), ["u2", "u1"]);
});
