CREATE TYPE "ProductCategory" AS ENUM ('BEGINNER', 'PRO', 'EXPERT', 'DIRECT_FUNDED');
CREATE TYPE "EvaluationStructure" AS ENUM ('THREE_STEP', 'FOUR_STEP', 'TWO_STEP', 'ONE_STEP', 'DIRECT_FUNDED');
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'UNAVAILABLE', 'RETIRED');
CREATE TYPE "RuleDisposition" AS ENUM ('REQUIRED', 'OPTIONAL', 'UNRESOLVED');

ALTER TABLE "Product"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "category" "ProductCategory",
  ADD COLUMN "evaluationStructure" "EvaluationStructure",
  ADD COLUMN "denominationCurrency" TEXT,
  ADD COLUMN "operatingRulesetVersionId" TEXT;

CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");
CREATE INDEX "Product_status_isActive_displayOrder_idx" ON "Product"("status", "isActive", "displayOrder");

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_operatingRulesetVersionId_fkey"
  FOREIGN KEY ("operatingRulesetVersionId") REFERENCES "RulesetVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProductStage" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "stageKey" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "stageOrder" INTEGER NOT NULL,
  "rulesetVersionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductStage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductStage_productId_stageKey_key" ON "ProductStage"("productId", "stageKey");
CREATE UNIQUE INDEX "ProductStage_productId_stageOrder_key" ON "ProductStage"("productId", "stageOrder");
CREATE INDEX "ProductStage_rulesetVersionId_idx" ON "ProductStage"("rulesetVersionId");

ALTER TABLE "ProductStage"
  ADD CONSTRAINT "ProductStage_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ProductStage_rulesetVersionId_fkey"
  FOREIGN KEY ("rulesetVersionId") REFERENCES "RulesetVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Rule"
  ADD COLUMN "disposition" "RuleDisposition" NOT NULL DEFAULT 'UNRESOLVED',
  ADD COLUMN "calculation" JSONB;

UPDATE "Rule"
SET "disposition" = CASE WHEN "isRequired" THEN 'REQUIRED'::"RuleDisposition" ELSE 'OPTIONAL'::"RuleDisposition" END;

ALTER TABLE "OrderItem" ADD COLUMN "productSnapshot" JSONB;

ALTER TABLE "Evaluation" ADD COLUMN "productStageId" TEXT;
ALTER TABLE "Evaluation" ADD COLUMN "orderId" TEXT;
CREATE UNIQUE INDEX "Evaluation_orderId_key" ON "Evaluation"("orderId");
ALTER TABLE "Evaluation"
  ADD CONSTRAINT "Evaluation_productStageId_fkey"
  FOREIGN KEY ("productStageId") REFERENCES "ProductStage"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Evaluation_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
