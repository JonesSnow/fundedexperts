const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const envPath = '.env.local';
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      process.env[key] = value;
    }
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log('Connected to database\n');

    const fkCheck = await prisma.$queryRaw`
      SELECT
        tc.table_name AS fk_table,
        kcu.column_name AS fk_column,
        tc2.table_name AS ref_table,
        rc.delete_referential_action_type
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name
      JOIN information_schema.table_constraints tc2
        ON rc.unique_constraint_name = tc2.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name
    `;

    let orphanCount = 0;

    for (const fk of fkCheck) {
      const { fk_table, fk_column, ref_table, delete_referential_action_type } = fk;

      const result = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS count
        FROM "${fk_table}" t
        WHERE t."${fk_column}" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "${ref_table}" r WHERE r.id = t."${fk_column}"
        )
      `;

      const count = result[0]?.count ?? 0;
      if (count > 0) {
        orphanCount += count;
        console.log(`ORPHAN: ${fk_table}.${fk_column} -> ${ref_table}.id — ${count} orphaned rows (FK action: ${delete_referential_action_type})`);
      }
    }

    if (orphanCount === 0) {
      console.log('No orphaned records found. All FK constraints satisfied.');
    } else {
      console.log(`\nTotal orphaned records: ${orphanCount}`);
    }

    // Check for other potential issues
    console.log('\n--- Additional Checks ---');

    const tables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name NOT LIKE '_%' AND table_name != '_prisma_migrations'
      ORDER BY table_name
    `;

    for (const { table_name } of tables) {
      const count = await prisma.$queryRaw`SELECT COUNT(*)::int FROM "${table_name}"`;
      const rowCount = count[0]?.count ?? 0;
      if (rowCount === 0) {
        console.log(`  ${table_name}: empty`);
      } else {
        console.log(`  ${table_name}: ${rowCount} rows`);
      }
    }
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error('FATAL:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
