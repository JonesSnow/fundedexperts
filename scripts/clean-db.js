const path = require("path");
const envPath = path.join(__dirname, "..", ".env.local");
if (require("fs").existsSync(envPath)) {
  const content = require("fs").readFileSync(envPath, "utf-8");
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
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const tables = [
    "CouponUsage", "Coupon", "OrderItem", "Order",
    "Product", "RulesetVersion", "Ruleset", "Trader", "LedgerEntry",
  ];
  for (const t of tables) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${t}" CASCADE`);
      console.log("Truncated " + t);
    } catch (e) {
      console.log("Failed " + t + ": " + e.message);
    }
  }
  await prisma.$disconnect();
})();
