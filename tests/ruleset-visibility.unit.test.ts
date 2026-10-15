import assert from "node:assert/strict";
import test from "node:test";
import {
  PUBLIC_RULESET_VERSION_WHERE,
  PUBLIC_RULESET_WHERE,
} from "../lib/ruleset-visibility";

test("public rulesets require an active ruleset and an active published version", () => {
  assert.deepEqual(PUBLIC_RULESET_WHERE, {
    isActive: true,
    versions: {
      some: {
        status: "PUBLISHED",
        isActive: true,
      },
    },
  });
});

test("public ruleset version lookups exclude disabled versions and parents", () => {
  assert.deepEqual(PUBLIC_RULESET_VERSION_WHERE, {
    status: "PUBLISHED",
    isActive: true,
    ruleset: { isActive: true },
  });
});
