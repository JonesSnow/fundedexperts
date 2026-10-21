import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const projectRoot = process.cwd();
const productPage = readFileSync(path.join(projectRoot, "app/admin/products/page.tsx"), "utf8");
const rulesetPage = readFileSync(path.join(projectRoot, "app/admin/rulesets/page.tsx"), "utf8");
const stageRoute = readFileSync(path.join(projectRoot, "app/api/products/[id]/stages/[stageId]/route.ts"), "utf8");
const ruleRoute = readFileSync(path.join(projectRoot, "app/api/rulesets/[id]/versions/[version]/rules/[ruleId]/route.ts"), "utf8");

describe("admin draft editors use existing protected update contracts", () => {
  it("allows editing a product stage through the draft stage PUT endpoint", () => {
    assert.match(productPage, /\/stages\/\$\{stage\.id\}`,[\s\S]{0,80}"PUT"/);
    assert.match(productPage, /stageKey,[\s\S]{0,80}displayName,[\s\S]{0,80}stageOrder: Number\(stageOrder\),[\s\S]{0,80}rulesetVersionId/);
    assert.match(stageRoute, /isActiveAdministrator\(trader\)/);
    assert.match(stageRoute, /stage\.product\.status !== "DRAFT"/);
  });

  it("allows editing draft rule fields through the existing rule PUT endpoint", () => {
    assert.match(rulesetPage, /\/rules\/\$\{rule\.id\}`,[\s\S]{0,80}"PUT"/);
    assert.match(rulesetPage, /version\.status === "DRAFT" && <RuleDraftEditor/);
    assert.match(rulesetPage, /effectiveDate: effectiveDate \|\| null/);
    assert.match(ruleRoute, /isActiveAdministrator\(trader\)/);
    assert.match(ruleRoute, /rulesetVersion\.status !== "DRAFT"/);
  });

  it("offers the full rule type set, including minimum trading days, in draft editors", () => {
    assert.match(rulesetPage, /\["MIN_TRADING_DAYS", "Minimum trading days"\]/);
    assert.equal((rulesetPage.match(/RULE_TYPE_OPTIONS\.map/g) ?? []).length, 2);
  });
});
