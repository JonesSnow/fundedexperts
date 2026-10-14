import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ruleset = await prisma.ruleset.findUnique({
    where: {
      id,
      isActive: true,
      versions: { some: { status: "PUBLISHED" } },
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
        where: {
          status: "PUBLISHED",
        },
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
