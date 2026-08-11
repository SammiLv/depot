import test from "node:test";
import assert from "node:assert/strict";
import { parseStructuredSummary } from "@/server/kpi/kpi-summary-utils";

test("empty praise block does not swallow the opportunity block", () => {
  const parsed = parseStructuredSummary(
    "【表扬】\n\n\n【机会】\n自评不到位，加强能力提升",
    "表扬",
    "机会",
  );
  assert.equal(parsed.first, "");
  assert.equal(parsed.second, "自评不到位，加强能力提升");
});

test("both structured blocks are parsed independently", () => {
  const parsed = parseStructuredSummary(
    "【表扬】\n表现优秀\n\n【机会】\n继续提升沟通能力",
    "表扬",
    "机会",
  );
  assert.equal(parsed.first, "表现优秀");
  assert.equal(parsed.second, "继续提升沟通能力");
});
