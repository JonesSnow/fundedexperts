import { isActiveAdministrator } from "@/lib/auth/admin-policy";
import { Prisma, Role, TraderStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { encodeCreatedAtCursor, parseCursorPage, type CreatedAtCursor } from "@/lib/cursor-pagination";

const LIFECYCLE_SECTIONS = ["orders", "evaluations", "fundedAccounts", "assignments"] as const;
type LifecycleSection = typeof LIFECYCLE_SECTIONS[number];

function pageRows<T extends { id: string }>(rows: T[], limit: number, getDate: (row: T) => Date) {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const lastItem = items.at(-1);
  return {
    items,
    nextCursor: hasMore && lastItem
      ? encodeCreatedAtCursor({ id: lastItem.id, createdAt: getDate(lastItem) })
      : null,
  };
}

function emptyCursorMap(section: LifecycleSection, cursor: string | null) {
  return {
    orders: section === "orders" ? cursor : null,
    evaluations: section === "evaluations" ? cursor : null,
    fundedAccounts: section === "fundedAccounts" ? cursor : null,
    assignments: section === "assignments" ? cursor : null,
  };
}


async function getAuthenticatedAdmin(request: NextRequest) {
  const token = getSessionCookie(request);
  if (!token) return null;
  const session = await getSession(token);
  if (!session) return null;
  const trader = await prisma.trader.findUnique({
    where: { id: session.sub },
    select: { id: true, role: true, status: true, email: true, firstName: true, lastName: true },
  });
  if (!isActiveAdministrator(trader)) {
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
    const identityOnly = searchParams.get("identityOnly") === "true";

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

    if (identityOnly) {
      return NextResponse.json({ success: true, customer }, { status: 200 });
    }

    const sectionValues = searchParams.getAll("section");
    if (sectionValues.length > 1) {
      return NextResponse.json({ success: false, error: "Invalid lifecycle section" }, { status: 400 });
    }
    const section = sectionValues[0] ?? null;
    if (section && !LIFECYCLE_SECTIONS.includes(section as LifecycleSection)) {
      return NextResponse.json({ success: false, error: "Invalid lifecycle section" }, { status: 400 });
    }

    const page = parseCursorPage(searchParams);
    if (!page.success) {
      return NextResponse.json({ success: false, error: page.error }, { status: 400 });
    }
    if (page.cursor && !section) {
      return NextResponse.json({ success: false, error: "A lifecycle section is required with a cursor" }, { status: 400 });
    }

    const cid = customer.id;
    const loadOrders = async (cursor: CreatedAtCursor | null) => {
      const where: Prisma.OrderWhereInput = cursor
        ? { AND: [{ traderId: cid }, { OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ] }] }
        : { traderId: cid };
      const rows = await prisma.order.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: page.limit + 1,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          currency: true,
          subtotal: true,
          taxAmount: true,
          totalAmount: true,
          createdAt: true,
          orderItems: { select: { product: { select: { name: true } } } },
        },
      });
      return pageRows(rows, page.limit, (row) => row.createdAt);
    };

    const loadEvaluations = async (cursor: CreatedAtCursor | null) => {
      const where: Prisma.EvaluationWhereInput = cursor
        ? { AND: [{ traderId: cid }, { OR: [
            { startedAt: { lt: cursor.createdAt } },
            { startedAt: cursor.createdAt, id: { lt: cursor.id } },
          ] }] }
        : { traderId: cid };
      const rows = await prisma.evaluation.findMany({
        where,
        orderBy: [{ startedAt: "desc" }, { id: "desc" }],
        take: page.limit + 1,
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          totalPnl: true,
          maxDrawdown: true,
          rulesetVersion: { select: { version: true, ruleset: { select: { name: true } } } },
          account: { select: { accountNumber: true, broker: true, server: true, status: true, healthStatus: true } },
          ruleEvaluations: { select: { result: true, rule: { select: { name: true } } } },
        },
      });
      const pageRowsResult = pageRows(rows, page.limit, (row) => row.startedAt);
      const evaluations = pageRowsResult.items.map((evaluation) => ({
        id: evaluation.id,
        status: evaluation.status,
        startedAt: evaluation.startedAt,
        completedAt: evaluation.completedAt,
        totalPnl: evaluation.totalPnl,
        maxDrawdown: evaluation.maxDrawdown,
        rulesetName: evaluation.rulesetVersion?.ruleset.name ?? null,
        rulesetVersion: evaluation.rulesetVersion?.version ?? null,
        account: evaluation.account,
        ruleResults: evaluation.ruleEvaluations.map((result) => ({ ruleName: result.rule.name, result: result.result })),
      }));
      return { ...pageRowsResult, items: evaluations };
    };

    const loadFundedAccounts = async (cursor: CreatedAtCursor | null) => {
      const where: Prisma.FundedAccountWhereInput = cursor
        ? { AND: [{ traderId: cid }, { OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ] }] }
        : { traderId: cid };
      const rows = await prisma.fundedAccount.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: page.limit + 1,
        select: { id: true, status: true, allocatedAt: true, activatedAt: true, closedAt: true, createdAt: true },
      });
      return pageRows(rows, page.limit, (row) => row.createdAt);
    };

    const loadAssignments = async (cursor: CreatedAtCursor | null) => {
      const where: Prisma.AccountAssignmentWhereInput = cursor
        ? { AND: [{ traderId: cid, status: "ASSIGNED" }, { OR: [
            { assignedAt: { lt: cursor.createdAt } },
            { assignedAt: cursor.createdAt, id: { lt: cursor.id } },
          ] }] }
        : { traderId: cid, status: "ASSIGNED" };
      const rows = await prisma.accountAssignment.findMany({
        where,
        orderBy: [{ assignedAt: "desc" }, { id: "desc" }],
        take: page.limit + 1,
        select: {
          id: true,
          assignedAt: true,
          account: { select: { id: true, accountNumber: true, broker: true, server: true, status: true, healthStatus: true } },
        },
      });
      return pageRows(rows, page.limit, (row) => row.assignedAt);
    };

    if (section === "orders") {
      const result = await loadOrders(page.cursor);
      return NextResponse.json({ success: true, customer, orders: result.items, nextCursors: emptyCursorMap("orders", result.nextCursor) });
    }
    if (section === "evaluations") {
      const result = await loadEvaluations(page.cursor);
      return NextResponse.json({ success: true, customer, evaluations: result.items, nextCursors: emptyCursorMap("evaluations", result.nextCursor) });
    }
    if (section === "fundedAccounts") {
      const result = await loadFundedAccounts(page.cursor);
      return NextResponse.json({ success: true, customer, fundedAccounts: result.items, nextCursors: emptyCursorMap("fundedAccounts", result.nextCursor) });
    }
    if (section === "assignments") {
      const result = await loadAssignments(page.cursor);
      return NextResponse.json({ success: true, customer, assignments: result.items, nextCursors: emptyCursorMap("assignments", result.nextCursor) });
    }

    const orders = await loadOrders(null);
    const evaluations = await loadEvaluations(null);
    const fundedAccounts = await loadFundedAccounts(null);
    const assignments = await loadAssignments(null);

    return NextResponse.json({
      success: true,
      customer,
      orders: orders.items,
      evaluations: evaluations.items,
      fundedAccounts: fundedAccounts.items,
      assignments: assignments.items,
      nextCursors: {
        orders: orders.nextCursor,
        evaluations: evaluations.nextCursor,
        fundedAccounts: fundedAccounts.nextCursor,
        assignments: assignments.nextCursor,
      },
    }, { status: 200 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch lifecycle" },
      { status: 500 },
    );
  }
}
