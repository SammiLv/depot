import assert from "node:assert/strict";
import test from "node:test";
import { parseIncidentLevelOptions } from "./incident-level-config";

test("人才决策事故等级选项读取工作事故等级配置", () => {
  assert.deepEqual(parseIncidentLevelOptions(JSON.stringify([
    { level: "A", name: "重大事故" },
    { level: "B", name: "一般事故" },
  ])), [
    { value: "A", label: "重大事故" },
    { value: "B", label: "一般事故" },
  ]);
});

test("事故等级选项过滤空值和重复编码", () => {
  assert.deepEqual(parseIncidentLevelOptions(JSON.stringify([
    { level: "C" },
    { level: "C", name: "重复项" },
    { level: "" },
  ])), [{ value: "C", label: "C级事故" }]);
});
