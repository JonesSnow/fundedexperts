import { PrismaClient, Role, TraderStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";

const prisma = new PrismaClient();

async function getAuthenticatedAdmin(request: NextRequest) {
  const token = getSessionCookie(request);
  if (!token) return null;
  const session = await getSession(token);
  if (!session) return null;
  const trader = await prisma.trader.findUnique({
    where: { id: session.sub },
    select: { id: true, role: true, status: true, email: true, firstName: true, lastName: true },
  });
  if (!trader || trader.role !== "ADMIN" || trader.status === "SUSPENDED" || trader.status === "INACTIVE") {
    return null;
  }
  return trader;
}

export async function GET(request: NextRequest) {
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    const customerEmail = searchParams.get("email");

    let customer: {
      id: string;
      email: string;
      role: Role;
      firstName: string | null;
      lastName: string | null;
      status: TraderStatus;
      createdAt: Date;
    } | null = null;

    if (customerId) {
      customer = await prisma.trader.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          status: true,
          createdAt: true,
        },
      });
    } else if (customerEmail) {
      customer = await prisma.trader.findUnique({
        where: { email: customerEmail },
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          status: true,
          createdAt: true,
        },
      });
    }

    if (!customer) {
      return NextResponse.json(
        { success: false, error: "Customer not found" },
        { status: 404 },
      );
    }

    const cid = customer.id;

    const orders = await prisma.order.findMany({
      where: { traderId: cid },
      orderBy: { createdAt: "desc" },
      include: {
        orderItems: {
          include: {
            product: { select: { id: true, name: true, accountSize: true, price: true, currency: true } },
          },
        },
      },
    });

    const evaluations = await prisma.evaluation.findMany({
      where: { traderId: cid },
      orderBy: { startedAt: "desc" },
      include: {
        rulesetVersion: {
          select: {
            id: true,
            version: true,
            ruleset: { select: { name: true } },
          },
        },
        account: {
          select: {
            id: true,
            accountNumber: true,
            broker: true,
            server: true,
            status: true,
            healthStatus: true,
          },
        },
        ruleEvaluations: {
          select: {
            ruleId: true,
            result: true,
            rule: { select: { ruleType: true, name: true } },
          },
        },
      },
    });

    const fundedAccounts = await prisma.fundedAccount.findMany({
      where: { traderId: cid },
      orderBy: { createdAt: "desc" },
      include: {
        evaluation: { select: { id: true, status: true } },
        account: { select: { id: true, accountNumber: true, status: true } },
        rulesetVersion: { select: { id: true, version: true } },
      },
    });

    const assignments = await prisma.accountAssignment.findMany({
      where: { traderId: cid, status: "ASSIGNED" },
      include: {
        account: {
          select: {
            id: true,
            accountNumber: true,
            broker: true,
            server: true,
            login: true,
            accountSize: true,
            currency: true,
            purpose: true,
            status: true,
            healthStatus: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        customer,
        orders,
        evaluations,
        fundedAccounts,
        assignments,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch lifecycle" },
      { status: 500 },
    );
  }
}
