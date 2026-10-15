import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PUBLIC_RULESET_WHERE, PUBLIC_RULESET_VERSION_WHERE } from "@/lib/ruleset-visibility";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ruleset = await prisma.ruleset.findUnique({
    where: {
      id,
      ...PUBLIC_RULESET_WHERE,
    },
    select: {
      id: true,
      name: true,
      description: true,
      versions: {
        select: {
          id: true,
          version: true,
          status: true,
        },
        where: PUBLIC_RULESET_VERSION_WHERE,
        orderBy: { version: "desc" },
      },
    },
  });

  if (!ruleset) {
    return NextResponse.json(
      { success: false, error: "Ruleset not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, ruleset }, { status: 200 });
}
