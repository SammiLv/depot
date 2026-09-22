/**
 * 审计写入服务单元测试
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  getChangedFields,
  generateCorrelationId,
} from "./write-audit-event";

test("getChangedFields - 应返回发生变化的字段", () => {
  const before = {
    name: "张三",
    role: "MEMBER",
    status: "ACTIVE",
  };

  const after = {
    name: "张三",
    role: "ADMIN",
    status: "ACTIVE",
  };

  const changed = getChangedFields(before, after);
  assert.deepStrictEqual(changed, ["role"]);
});

test("getChangedFields - 应检测新增字段", () => {
  const before = {
    name: "张三",
  };

  const after = {
    name: "张三",
    role: "ADMIN",
  };

  const changed = getChangedFields(before, after);
  assert.ok(changed.includes("role"));
});

test("getChangedFields - 应检测删除字段", () => {
  const before = {
    name: "张三",
    role: "ADMIN",
  };

  const after = {
    name: "张三",
  };

  const changed = getChangedFields(before, after);
  assert.ok(changed.includes("role"));
});

test("getChangedFields - 当数据为空时应返回空数组", () => {
  assert.deepStrictEqual(getChangedFields(null, null), []);
  assert.deepStrictEqual(getChangedFields(undefined, { name: "test" }), []);
  assert.deepStrictEqual(getChangedFields({ name: "test" }, null), []);
});

test("getChangedFields - 应检测多个字段变化", () => {
  const before = {
    name: "张三",
    role: "MEMBER",
    status: "ACTIVE",
    email: "old@example.com",
  };

  const after = {
    name: "李四",
    role: "ADMIN",
    status: "ACTIVE",
    email: "new@example.com",
  };

  const changed = getChangedFields(before, after);
  assert.strictEqual(changed.length, 3);
  assert.ok(changed.includes("name"));
  assert.ok(changed.includes("role"));
  assert.ok(changed.includes("email"));
  assert.ok(!changed.includes("status"));
});

test("generateCorrelationId - 应生成唯一的批次 ID", () => {
  const id1 = generateCorrelationId();
  const id2 = generateCorrelationId();

  assert.match(id1, /^batch_\d+_[a-z0-9]+$/);
  assert.match(id2, /^batch_\d+_[a-z0-9]+$/);
  assert.notStrictEqual(id1, id2);
});
