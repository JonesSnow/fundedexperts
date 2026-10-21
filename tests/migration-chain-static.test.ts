import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const projectRoot = join(__dirname, "..");
const migrationsRoot = join(projectRoot, "prisma", "migrations");
const migrationNames = readdirSync(migrationsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

function migrationSql(name: string): string {
  return readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8");
}

function withoutSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");
}

describe("Prisma migration chain static checks", () => {
  it("has an ordered, complete PostgreSQL migration directory structure", () => {
    assert.ok(migrationNames.length > 0);
    assert.ok(migrationNames.every((name) => /^\d{14}_[a-z0-9_]+$/.test(name)));
    assert.equal(new Set(migrationNames.map((name) => name.slice(0, 14))).size, migrationNames.length);
    assert.ok(migrationNames.every((name) => {
      try {
        readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8");
        return true;
      } catch {
        return false;
      }
    }));
    assert.match(readFileSync(join(migrationsRoot, "migration_lock.toml"), "utf8"), /provider\s*=\s*"postgresql"/);
  });

  it("has migration definitions for every Prisma model and enum", () => {
    const schema = readFileSync(join(projectRoot, "prisma", "schema.prisma"), "utf8");
    const migrationSql = migrationNames.map(migrationSqlForName).join("\n");
    const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]);
    const enums = [...schema.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((match) => match[1]);

    for (const model of models) {
      assert.ok(
        migrationSql.includes(`CREATE TABLE "${model}"`),
        `No checked-in migration creates the Prisma model table ${model}.`,
      );
    }
    for (const enumName of enums) {
      assert.ok(
        migrationSql.includes(`CREATE TYPE "${enumName}" AS ENUM`),
        `No checked-in migration creates the Prisma enum ${enumName}.`,
      );
    }
  });

  it("orders product-domain dependencies before ProductStage references", () => {
    const initialMigration = "20260920164647_init";
    const orderMigration = "20260922105355_add_order_model";
    const productDomainMigration = "20261013000000_product_domain_foundation";
    const initialSql = migrationSql(initialMigration);
    const orderSql = migrationSql(orderMigration);
    const productDomainSql = migrationSql(productDomainMigration);
    const schema = readFileSync(join(projectRoot, "prisma", "schema.prisma"), "utf8");

    assert.ok(migrationNames.indexOf(initialMigration) < migrationNames.indexOf(productDomainMigration));
    assert.ok(migrationNames.indexOf(orderMigration) < migrationNames.indexOf(productDomainMigration));
    assert.match(initialSql, /CREATE TABLE "Product"\s*\(/);
    assert.match(initialSql, /CREATE TABLE "RulesetVersion"\s*\(/);
    assert.match(orderSql, /CREATE TABLE "Order"\s*\(/);
    assert.match(productDomainSql, /CREATE TABLE "ProductStage"\s*\(/);
    assert.match(productDomainSql, /REFERENCES "Product"\("id"\)/);
    assert.match(productDomainSql, /REFERENCES "RulesetVersion"\("id"\)/);
    assert.match(productDomainSql, /REFERENCES "Order"\("id"\)/);
    assert.match(schema, /model ProductStage\s*\{/);
  });

  it("keeps the two monitoring migrations ordered with separate creation and alignment work", () => {
    const createMigration = "20260921130000_monitoring_persistence";
    const alignmentMigration = "20260921140238_monitoring_persistence";
    const createSql = migrationSql(createMigration);
    const alignmentSql = migrationSql(alignmentMigration);

    assert.ok(migrationNames.indexOf(createMigration) < migrationNames.indexOf(alignmentMigration));
    assert.match(createSql, /CREATE TABLE "MonitoringJob"\s*\(/);
    assert.match(createSql, /MonitoringJob_active_job_per_account/);
    assert.doesNotMatch(alignmentSql, /CREATE TABLE "MonitoringJob"\s*\(/);
    assert.match(alignmentSql, /ALTER TABLE "MonitoringJob"/);
  });

  it("keeps broad table/data deletion out of every migration", () => {
    for (const name of migrationNames) {
      const sql = withoutSqlComments(migrationSql(name));
      assert.doesNotMatch(
        sql,
        /\b(?:DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE(?:\s+TABLE)?|DELETE\s+FROM)\b/i,
        `${name} contains a destructive table or row operation that needs separate review.`,
      );
    }
  });

  it("limits historical row updates to the two documented migration backfills", () => {
    const updates = migrationNames.flatMap((name) => {
      const sql = withoutSqlComments(migrationSql(name));
      return [...sql.matchAll(/\bUPDATE\s+"([^"]+)"/gi)].map((match) => [name, match[1]]);
    });

    assert.deepEqual(updates, [
      ["20260927000000_evaluation_starting_balance", "Evaluation"],
      ["20261013000000_product_domain_foundation", "Rule"],
    ]);

    const startingBalanceSql = withoutSqlComments(migrationSql("20260927000000_evaluation_starting_balance"));
    assert.match(startingBalanceSql, /WHERE\s+e\."accountId"\s*=\s*a\."id"[\s\S]*e\."startingBalance"\s+IS\s+NULL[\s\S]*a\."accountSize"\s+IS\s+NOT\s+NULL/i);

    const dispositionSql = withoutSqlComments(migrationSql("20261013000000_product_domain_foundation"));
    assert.match(dispositionSql, /ADD COLUMN "disposition" "RuleDisposition" NOT NULL DEFAULT 'UNRESOLVED'/i);
    assert.match(dispositionSql, /UPDATE "Rule"\s+SET "disposition"\s*=\s*CASE WHEN "isRequired" THEN 'REQUIRED'::"RuleDisposition" ELSE 'OPTIONAL'::"RuleDisposition" END/i);
  });

  it("adds the optional evaluation product link after product tables exist and matches the timezone-aware column", () => {
    const integrityMigration = "20261014000000_evaluation_integrity";
    const productLinkMigration = "20261021000000_evaluation_product_link";
    const integritySql = migrationSql(integrityMigration);
    const productLinkSql = migrationSql(productLinkMigration);
    const schema = readFileSync(join(projectRoot, "prisma", "schema.prisma"), "utf8");

    assert.ok(migrationNames.indexOf(integrityMigration) < migrationNames.indexOf(productLinkMigration));
    assert.match(integritySql, /ADD COLUMN "sourceDataTimestamp" TIMESTAMPTZ/);
    assert.match(schema, /sourceDataTimestamp\s+DateTime\?\s+@db\.Timestamptz\(6\)/);
    assert.match(productLinkSql, /ALTER TABLE "Evaluation"\s+ADD COLUMN "productId" TEXT/);
    assert.match(productLinkSql, /ADD CONSTRAINT "Evaluation_productId_fkey"[\s\S]*REFERENCES "Product"\("id"\)[\s\S]*ON DELETE SET NULL ON UPDATE CASCADE/);
    assert.doesNotMatch(productLinkSql, /^\s*(?:DROP\b|DELETE\s+FROM\b|TRUNCATE\b|UPDATE\s+)/im);
  });
});

function migrationSqlForName(name: string): string {
  return migrationSql(name);
}
