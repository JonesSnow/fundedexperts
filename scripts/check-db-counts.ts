import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  const tables = [
    "order", "evaluation", "ledgerEntry", "orderItem", "product",
    "ruleset", "rulesetVersion", "trader", "mT5Account",
    "accountAssignment", "monitoringJob", "auditLog",
  ];
  const counts: Record<string, number> = {};
  for (const t of tables) {
    try {
      const c = await (prisma as unknown as Record<string, unknown>)[t].count();
      counts[t] = c as number;
    } catch {
      counts[t] = -1;
    }
  }
  console.log(JSON.stringify(counts, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
