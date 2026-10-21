import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const publicSources = [
  readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFileSync(new URL("../app/catalog/page.tsx", import.meta.url), "utf8"),
  readFileSync(new URL("../app/rules/page.tsx", import.meta.url), "utf8"),
  readFileSync(new URL("../components/working-plan-preview.tsx", import.meta.url), "utf8"),
];
const publicSource = publicSources.join("\n");

assert.doesNotMatch(publicSource, /WORKING_PLAN_PREVIEW|@\/lib\/working-plan-preview/);
assert.doesNotMatch(publicSource, /\$\s?\d[\d,]*(?:\.\d+)?/);
assert.doesNotMatch(publicSource, /(?:5|10|8|6)%\s*(?:\([^)]*proposal[^)]*\))?/i);
assert.match(publicSource, /Historical proposals remain unpublished/);
assert.match(publicSource, /approved active offer/);

console.log("Public pages do not expose historical draft product terms.");
