const { Prisma, PrismaClient } = require("@prisma/client");

async function main() {
  const envPath = ".env.local";
  const fs = require("fs");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      process.env[key] = value;
    }
  }
  const p = new PrismaClient();
  try {
    await p.$connect();
    const tables = [
      "RuleEvaluation", "Rule", "OrderItem", "Order", "Evaluation",
      "FundedAccount", "AccountAssignment", "MT5Account", "Product",
      "RulesetVersion", "Ruleset", "CouponUsage", "Coupon", "Notification",
      "Trader", "LedgerEntry",
    ];
    for (const t of tables) {
      await p.$executeRaw(Prisma.raw(`TRUNCATE TABLE "${t}" CASCADE`));
    }
    await p.$executeRaw(Prisma.raw(`TRUNCATE TABLE "AuditLog" CASCADE`));
    console.log("DB reset complete");
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
