-- Add the optional product reference present in the Prisma model.
-- Existing evaluations remain valid; product attribution is not inferred.
ALTER TABLE "Evaluation"
  ADD COLUMN "productId" TEXT;

ALTER TABLE "Evaluation"
  ADD CONSTRAINT "Evaluation_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
