const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
async function main() {
  const columns = await prisma.$queryRaw`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'AuditLog'
    ORDER BY ordinal_position;
  `;
  console.log(JSON.stringify(columns, null, 2));
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
