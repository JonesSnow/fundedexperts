-- CreateIndex
CREATE UNIQUE INDEX "AccountAssignment_active_unique" ON "AccountAssignment"("accountId") WHERE "status" = 'ASSIGNED';
