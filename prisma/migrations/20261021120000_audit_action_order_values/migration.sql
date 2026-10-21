-- Add ORDER_CREATED and ORDER_PAID to AuditAction enum.
-- These values were added to the Prisma schema but no migration was created.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ORDER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ORDER_PAID';