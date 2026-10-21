import { PrismaClient } from "@prisma/client";
import { resolveAndVerifyTestDatabase } from "../tests/support/test-db-guard";
import { assertTestDatabaseIdentity, configuredDatabasePort } from "../tests/support/test-db-identity";

async function main(): Promise<void> {
  const { resolved } = resolveAndVerifyTestDatabase(process.env as NodeJS.ProcessEnv);
  const prisma = new PrismaClient({ datasourceUrl: resolved.url });
  try {
    const [identity] = await prisma.$queryRaw<Array<{
      databaseName: string;
      userName: string;
      serverAddress: string | null;
      serverPort: number | null;
      serverVersion: string;
    }>>`
      SELECT current_database() AS "databaseName",
        current_user AS "userName",
        inet_server_addr()::text AS "serverAddress",
        inet_server_port() AS "serverPort",
        current_setting('server_version') AS "serverVersion"
    `;
    if (!identity) throw new Error("Database identity query returned no result.");
    assertTestDatabaseIdentity(identity, {
      configuredPort: configuredDatabasePort(resolved.url),
      githubActions: process.env.GITHUB_ACTIONS === "true",
    });
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch(() => {
  console.error("Test database identity verification failed; details are redacted.");
  process.exitCode = 1;
});
