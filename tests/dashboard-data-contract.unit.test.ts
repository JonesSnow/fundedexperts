import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(
  new URL("../app/dashboard/page.tsx", import.meta.url),
  "utf8",
);

test("dashboard treats malformed or unsuccessful collection responses as errors", () => {
  assert.match(dashboard, /!Array\.isArray\(body\.orders\)/);
  assert.match(dashboard, /!body\.summary/);
  assert.match(dashboard, /setOrderSummary\(body\.summary\)/);
  assert.match(dashboard, /!Array\.isArray\(body\.evaluations\)/);
  assert.match(dashboard, /setEvaluationSummary\(body\.summary\)/);
  assert.match(dashboard, /evaluationSummary\?\.statusCounts\.IN_PROGRESS/);
  assert.match(dashboard, /evaluationSummary\.largestDrawdown/);
  assert.match(dashboard, /!response\.ok \|\| !body\.success \|\| !Array\.isArray\(body\.accounts\)/);
});

test("dashboard summary avoids unsupported balance and equity claims", () => {
  assert.match(dashboard, /label="Orders recorded"/);
  assert.match(dashboard, /label="Active evaluations"/);
  assert.doesNotMatch(dashboard, /label="(?:Balance|Equity)"/);
});
