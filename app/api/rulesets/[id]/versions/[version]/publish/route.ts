import { isActiveAdministrator } from "@/lib/auth/admin-policy";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { validateRulesetForPublication } from "@/lib/product-domain";


async function getAuthenticatedUser(request: NextRequest) {
  const token = getSessionCookie(request);
  if (!token) return null;
  const session = await getSession(token);
  if (!session) return null;
  const trader = await prisma.trader.findUnique({
    where: { id: session.sub },
    select: { id: true, role: true, status: true },
  });
  if (!trader || trader.status === "SUSPENDED" || trader.status === "INACTIVE") {
    return null;
  }
  return trader;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  const { id, version } = await params;
  const trader = await getAuthenticatedUser(request);
  if (!trader) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  if (!isActiveAdministrator(trader)) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const rulesetVersion = await tx.rulesetVersion.findFirst({
        where: { rulesetId: id, version },
        include: { rules: true },
      });
      if (!rulesetVersion) return { kind: "missing" as const };
      if (rulesetVersion.status !== "DRAFT") return { kind: "immutable" as const };

      const errors = validateRulesetForPublication(rulesetVersion.rules);
      if (errors.length > 0) return { kind: "invalid" as const, errors };

      const updated = await tx.rulesetVersion.updateMany({
        where: { id: rulesetVersion.id, status: "DRAFT" },
        data: { status: "PUBLISHED" },
      });
      if (updated.count !== 1) return { kind: "immutable" as const };
      const published = await tx.rulesetVersion.findUnique({ where: { id: rulesetVersion.id } });
      await tx.auditLog.create({
        data: {
          action: "RULESET_VERSION_PUBLISHED",
          entityType: "RulesetVersion",
          entityId: rulesetVersion.id,
          performedBy: trader.id,
          details: { rulesetId: id, version, ruleCount: rulesetVersion.rules.length },
        },
      });
      return { kind: "published" as const, rulesetVersion: published };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result.kind === "missing") return NextResponse.json({ success: false, error: "Ruleset version not found" }, { status: 404 });
    if (result.kind === "immutable") return NextResponse.json({ success: false, error: "Only draft versions can be published" }, { status: 409 });
    if (result.kind === "invalid") return NextResponse.json({ success: false, error: "Ruleset version cannot be published", errors: result.errors }, { status: 409 });
    return NextResponse.json({ success: true, rulesetVersion: result.rulesetVersion }, { status: 200 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ success: false, error: "Rules changed during publication; reload and validate again" }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: "Failed to publish version" }, { status: 500 });
  }
}
