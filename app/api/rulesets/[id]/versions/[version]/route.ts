import { isActiveAdministrator } from "@/lib/auth/admin-policy";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";


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

export async function PUT(
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
    const rulesetVersion = await prisma.rulesetVersion.findFirst({
      where: {
        rulesetId: id,
        version,
      },
    });

    if (!rulesetVersion) {
      return NextResponse.json(
        { success: false, error: "Ruleset version not found" },
        { status: 404 }
      );
    }

    if (rulesetVersion.status !== "DRAFT") {
      return NextResponse.json(
        { success: false, error: "Only draft versions can be modified" },
        { status: 409 }
      );
    }

    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ success: false, error: "Version draft object is required" }, { status: 400 });
    const effectiveDateValue = (body as Record<string, unknown>).effectiveDate;
    if (effectiveDateValue !== undefined && effectiveDateValue !== null && (typeof effectiveDateValue !== "string" || Number.isNaN(Date.parse(effectiveDateValue)))) {
      return NextResponse.json({ success: false, error: "Effective date must be a valid date string or null" }, { status: 400 });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const change = await tx.rulesetVersion.updateMany({
        where: { id: rulesetVersion.id, status: "DRAFT" },
        data: { effectiveDate: effectiveDateValue === undefined ? undefined : effectiveDateValue === null ? null : new Date(effectiveDateValue) },
      });
      if (change.count !== 1) throw new Error("RULESET_VERSION_IMMUTABLE");
      const versionRecord = await tx.rulesetVersion.findUnique({ where: { id: rulesetVersion.id } });
      if (!versionRecord) throw new Error("RULESET_VERSION_MISSING");
      await tx.auditLog.create({
        data: { action: "RULESET_UPDATED", entityType: "RulesetVersion", entityId: versionRecord.id, performedBy: trader.id, details: { rulesetId: id, version: versionRecord.version, effectiveDateChanged: effectiveDateValue !== undefined } },
      });
      return versionRecord;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(
      { success: true, rulesetVersion: updated },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "RULESET_VERSION_IMMUTABLE") return NextResponse.json({ success: false, error: "Only draft versions can be modified" }, { status: 409 });
    return NextResponse.json(
      { success: false, error: "Failed to update version" },
      { status: 500 }
    );
  }
}
