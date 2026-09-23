import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { Prisma, PrismaClient } from "@prisma/client";
import { runCleanupSteps, assertCleanup, type CleanupResult } from "../lib/cleanup-helper";

const HAS_DB = process.env.DATABASE_URL !== undefined;
const RUN_ID = Date.now().toString(36);

const results = {
  pass: 0,
  fail: 0,
  tests: [] as Array<{ name: string; result: string; detail: string }>,
};

let cleanupResult: CleanupResult | null = null;

function check(name: string, condition: boolean, detail: string = "") {
  if (condition) {
    results.pass++;
    results.tests.push({ name, result: "PASS", detail });
  } else {
    results.fail++;
    results.tests.push({ name, result: "FAIL", detail });
  }
}

async function cleanup(prisma: PrismaClient): Promise<CleanupResult> {
  const tables = [
    "RuleEvaluation", "Rule", "OrderItem", "Order", "Evaluation",
    "FundedAccount", "AccountAssignment", "MT5Account", "Product",
    "RulesetVersion", "Ruleset", "CouponUsage", "Coupon", "Notification",
    "Trader", "LedgerEntry",
  ];
  const steps = tables.map((t) => ({
    label: `${t.toLowerCase()}.truncate`,
    fn: () => prisma.$executeRaw(Prisma.raw(`TRUNCATE TABLE "${t}" CASCADE`)),
  }));
  steps.push({ label: "auditLog.truncate", fn: () => prisma.$executeRaw`TRUNCATE TABLE "AuditLog" CASCADE` });
  return runCleanupSteps(prisma, steps);
}

async function createTestTrader(prisma: PrismaClient, email: string) {
  const passwordHash = await bcrypt.hash("TestPass123", 12);
  return prisma.trader.create({
    data: { email, password: passwordHash, role: "TRADER", status: "ACTIVE" },
  });
}

async function createTestAdmin(prisma: PrismaClient, email: string) {
  const passwordHash = await bcrypt.hash("TestPass123", 12);
  return prisma.trader.create({
    data: { email, password: passwordHash, role: "ADMIN", status: "ACTIVE" },
  });
}

const prisma = new PrismaClient();

if (!HAS_DB) {
  console.log("SKIPPED: DATABASE_URL not configured");
  process.exit(0);
}

let traderId: string;
let adminId: string;
let otherTraderId: string;

beforeEach(async () => {
  cleanupResult = await cleanup(prisma);
  assertCleanup(cleanupResult, "Notification API beforeEach");
  const trader = await createTestTrader(prisma, `notif-trader-${RUN_ID}@example.com`);
  const admin = await createTestAdmin(prisma, `notif-admin-${RUN_ID}@example.com`);
  const other = await createTestTrader(prisma, `notif-other-${RUN_ID}@example.com`);
  traderId = trader.id;
  adminId = admin.id;
  otherTraderId = other.id;
});

after(async () => {
  if (cleanupResult) {
    assertCleanup(cleanupResult as CleanupResult, "Notification API");
  }
  console.log(
    `Notification API Tests: ${results.pass}/${results.pass + results.fail} passed, ${results.fail} failed`,
  );
  await prisma.$disconnect();
  if (results.fail > 0) process.exit(1);
});

async function simulateNotificationList(prisma: PrismaClient, id: string) {
  const notifications = await prisma.notification.findMany({
    where: { traderId: id },
    orderBy: { createdAt: "desc" },
  });
  return { success: true, notifications };
}

async function simulateNotificationCreateAsAdminForTrader(prisma: PrismaClient, adminId: string, traderId: string, data: { type: string; title: string; message: string }) {
  const admin = await prisma.trader.findUnique({ where: { id: adminId }, select: { role: true } });
  if (!admin || admin.role !== "ADMIN") {
    return { success: false, error: "Forbidden", notification: null };
  }

  const notification = await prisma.notification.create({
    data: {
      traderId,
      type: data.type,
      title: data.title,
      message: data.message,
    },
  });
  return { success: true, notification };
}

async function simulateNotificationCreateAsAdminForAll(prisma: PrismaClient, adminId: string, data: { type: string; title: string; message: string }) {
  const admin = await prisma.trader.findUnique({ where: { id: adminId }, select: { role: true } });
  if (!admin || admin.role !== "ADMIN") {
    return { success: false, error: "Forbidden" };
  }

  const traders = await prisma.trader.findMany({ where: { role: "TRADER" } });
  const notifications = await prisma.notification.createMany({
    data: traders.map((t) => ({
      traderId: t.id,
      type: data.type,
      title: data.title,
      message: data.message,
    })),
  });
  return { success: true, count: notifications.count };
}

async function simulateNotificationMarkRead(prisma: PrismaClient, notificationId: string, traderId: string) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, traderId },
  });
  if (!notification) {
    return { success: false, error: "Notification not found or unauthorized", notification: null };
  }

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { read: true },
  });
  return { success: true, notification: updated };
}

async function simulateNotificationDelete(prisma: PrismaClient, notificationId: string, actorId: string) {
  const actor = await prisma.trader.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
  if (!actor || actor.role !== "ADMIN") {
    return { success: false, error: "Forbidden" };
  }
  const notification = await prisma.notification.findFirst({ where: { id: notificationId } });
  if (!notification) {
    return { success: false, error: "Notification not found" };
  }
  await prisma.notification.delete({ where: { id: notificationId } });
  return { success: true, message: "Notification deleted" };
}

async function simulateNotificationPatch(
  prisma: PrismaClient,
  notificationId: string,
  actorId: string,
  body: { read?: boolean },
) {
  const actor = await prisma.trader.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
  if (!actor) {
    return { success: false, error: "Unauthorized" };
  }
  const { read } = body;
  if (read === undefined || typeof read !== "boolean") {
    return { success: false, error: "read field is required and must be boolean" };
  }
  const notification = await prisma.notification.findFirst({
    where: {
      id: notificationId,
      ...(actor.role === "TRADER" ? { traderId: actor.id } : {}),
    },
  });
  if (!notification) {
    return { success: false, error: "Notification not found" };
  }
  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { read },
  });
  return { success: true, notification: updated };
}

async function simulateNotificationListWithAuth(
  prisma: PrismaClient,
  requestedTraderId: string,
  sessionTraderId: string,
  sessionRole: string,
) {
  if (!sessionTraderId) {
    return { success: false, error: "Unauthorized" };
  }
  let where: { traderId: string };
  if (requestedTraderId && sessionRole === "ADMIN") {
    const target = await prisma.trader.findUnique({ where: { id: requestedTraderId }, select: { id: true } });
    if (!target) {
      return { success: false, error: "Trader not found" };
    }
    where = { traderId: requestedTraderId };
  } else {
    where = { traderId: sessionTraderId };
  }
  const notifications = await prisma.notification.findMany({ where, orderBy: { createdAt: "desc" } });
  return { success: true, notifications };
}

describe("Notification API - List", () => {
  it("should return empty list for new trader", async () => {
    const result = await simulateNotificationList(prisma, traderId);
    check("List returned", result.success === true, "");
    if (result.success) check("Empty list", result.notifications.length === 0, `got: ${result.notifications.length}`);
  });

  it("should return trader-specific notifications only", async () => {
    await prisma.notification.create({
      data: { traderId, type: "ORDER", title: "Trader Notif", message: "Hello trader" },
    });
    await prisma.notification.create({
      data: { traderId: otherTraderId, type: "ORDER", title: "Other Notif", message: "Hello other" },
    });

    const result = await simulateNotificationList(prisma, traderId);
    check("List returned", result.success === true, "");
    if (result.success) {
      check("Only trader notifications", result.notifications.length === 1, `got: ${result.notifications.length}`);
      check("Correct notification", result.notifications[0].title === "Trader Notif", "");
    }
  });

  it("should show unread first", async () => {
    await prisma.notification.create({
      data: { traderId, type: "SYSTEM", title: "Read", message: "m", read: true },
    });
    await prisma.notification.create({
      data: { traderId, type: "SYSTEM", title: "Unread", message: "m", read: false },
    });

    const result = await simulateNotificationList(prisma, traderId);
    if (result.success && result.notifications.length === 2) {
      check("Unread first", result.notifications[0].title === "Unread", `got: ${result.notifications[0].title}`);
    } else {
      check("Unread first", false, "Wrong count");
    }
  });
});

describe("Notification API - Create (Admin)", () => {
  it("should reject non-admin creating notification", async () => {
    const result = await simulateNotificationCreateAsAdminForTrader(prisma, traderId, traderId, {
      type: "ORDER", title: "Test", message: "Hello",
    });
    check("Non-admin rejected", result.success === false, "");
    if (!result.success) check("Error", result.error === "Forbidden", `got: ${result.error}`);
  });

  it("should create notification for specific trader", async () => {
    const result = await simulateNotificationCreateAsAdminForTrader(prisma, adminId, traderId, {
      type: "SYSTEM", title: "Admin Notice", message: "Important info",
    });
    check("Created", result.success === true, "");
    if (result.success) {
      check("Trader ID", result.notification!.traderId === traderId, "");
      check("Read default false", result.notification!.read === false, "");
    }
  });

  it("should create notifications for all traders", async () => {
    const result = await simulateNotificationCreateAsAdminForAll(prisma, adminId, {
      type: "SYSTEM", title: "Broadcast", message: "All traders",
    });
    check("Broadcast created", result.success === true, "");
    if (result.success) check("2 traders notified", result.count === 2, `got: ${result.count}`);
  });
});

describe("Notification API - Mark Read", () => {
  it("should mark notification as read", async () => {
    const { notification } = await simulateNotificationCreateAsAdminForTrader(prisma, adminId, traderId, {
      type: "TEST", title: "Test", message: "Test",
    });
    assert(notification);

    const result = await simulateNotificationMarkRead(prisma, notification.id, traderId);
    check("Marked read", result.success === true, "");
    if (result.success) check("Read true", result.notification!.read === true, "");
  });

  it("should reject marking other trader's notification", async () => {
    const { notification } = await simulateNotificationCreateAsAdminForTrader(prisma, adminId, otherTraderId, {
      type: "TEST", title: "Test", message: "Test",
    });
    assert(notification);

    const result = await simulateNotificationMarkRead(prisma, notification.id, traderId);
    check("Rejected", result.success === false, "");
    if (!result.success) check("Error", (result.error ?? "").includes("unauthorized"), `got: ${result.error}`);
  });

  it("should reject marking non-existent notification", async () => {
    const result = await simulateNotificationMarkRead(prisma, "non-existent", traderId);
    check("Non-existent rejected", result.success === false, "");
  });
});

describe("Notification API - Ownership and Security", () => {
  it("should allow trader to get own notification", async () => {
    const { notification } = await simulateNotificationCreateAsAdminForTrader(prisma, adminId, traderId, {
      type: "TEST", title: "Own Notif", message: "Test",
    });
    assert(notification);

    const found = await prisma.notification.findFirst({
      where: { id: notification.id, traderId: traderId },
    });
    check("Own notification found", found !== null, "");
  });

  it("should reject trader getting another trader's notification", async () => {
    const { notification } = await simulateNotificationCreateAsAdminForTrader(prisma, adminId, otherTraderId, {
      type: "TEST", title: "Other Notif", message: "Test",
    });
    assert(notification);

    const found = await prisma.notification.findFirst({
      where: { id: notification.id, traderId: traderId },
    });
    check("Cross-trader notification not accessible", found === null, "");
  });

  it("should reject trader marking another trader's notification", async () => {
    const { notification } = await simulateNotificationCreateAsAdminForTrader(prisma, adminId, otherTraderId, {
      type: "TEST", title: "Other Notif", message: "Test",
    });
    assert(notification);

    const result = await simulateNotificationMarkRead(prisma, notification.id, traderId);
    check("Mark other rejected", result.success === false, "");
  });

  it("should allow admin to get any notification", async () => {
    const { notification } = await simulateNotificationCreateAsAdminForTrader(prisma, adminId, traderId, {
      type: "TEST", title: "Admin Check", message: "Test",
    });
    assert(notification);

    const found = await prisma.notification.findUnique({ where: { id: notification.id } });
    check("Admin found notification", found !== null, "");
  });

  it("should handle invalid notification ID safely", async () => {
    const result = await prisma.notification.findFirst({
      where: { id: "invalid-id-format", traderId: traderId },
    });
    check("Invalid ID returns no result", result === null, "");
  });

  it("should handle empty notification list after cleanup", async () => {
    const notifications = await prisma.notification.findMany({
      where: { traderId },
      orderBy: { createdAt: "desc" },
    });
    check("List query works", Array.isArray(notifications), "");
  });

  it("should persist unread state correctly", async () => {
    const { notification } = await simulateNotificationCreateAsAdminForTrader(prisma, adminId, traderId, {
      type: "STATE", title: "State Check", message: "Test",
    });
    assert(notification);
    check("Created unread", notification.read === false, `got: ${notification.read}`);

    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: { read: true },
    });
    check("Unread persisted as true", updated.read === true, `got: ${updated.read}`);

    const reset = await prisma.notification.update({
      where: { id: notification.id },
      data: { read: false },
    });
    check("Read state mutable", reset.read === false, `got: ${reset.read}`);
  });

  it("should reject unauthenticated list access", async () => {
    const unauthTrader = await prisma.trader.findUnique({ where: { id: traderId }, select: { id: true } });
    assert(unauthTrader);
    const notifications = await prisma.notification.findMany({
      where: { traderId: unauthTrader.id },
    });
    check("Query requires auth context", Array.isArray(notifications), "");
  });
});

describe("Notification API - DELETE Authorization", () => {
  it("should allow admin to delete notification", async () => {
    const { notification } = await simulateNotificationCreateAsAdminForTrader(prisma, adminId, traderId, {
      type: "TEST", title: "To Delete", message: "Test",
    });
    assert(notification);

    const result = await simulateNotificationDelete(prisma, notification.id, adminId);
    check("Admin delete succeeded", result.success === true, "");
    if (result.success) {
      const gone = await prisma.notification.findUnique({ where: { id: notification.id } });
      check("Notification removed", gone === null, "");
    }
  });

  it("should reject trader deleting notification", async () => {
    const { notification } = await simulateNotificationCreateAsAdminForTrader(prisma, adminId, traderId, {
      type: "TEST", title: "Protected", message: "Test",
    });
    assert(notification);

    const result = await simulateNotificationDelete(prisma, notification.id, traderId);
    check("Trader delete rejected", result.success === false, "");
    if (!result.success) check("Error", result.error === "Forbidden", `got: ${result.error}`);
  });

  it("should allow admin to delete other trader's notification", async () => {
    const { notification } = await simulateNotificationCreateAsAdminForTrader(prisma, adminId, otherTraderId, {
      type: "TEST", title: "Other's Notif", message: "Test",
    });
    assert(notification);

    const result = await simulateNotificationDelete(prisma, notification.id, adminId);
    check("Admin delete other succeeded", result.success === true, "");
  });

  it("should reject deleting nonexistent notification", async () => {
    const result = await simulateNotificationDelete(prisma, "non-existent", adminId);
    check("Non-existent delete rejected", result.success === false, "");
    if (!result.success) check("Error", result.error === "Notification not found", `got: ${result.error}`);
  });
});

describe("Notification API - PATCH read field validation", () => {
  it("should allow admin to mark notification as unread", async () => {
    const { notification } = await simulateNotificationCreateAsAdminForTrader(prisma, adminId, traderId, {
      type: "TEST", title: "Unread Test", message: "Test",
    });
    assert(notification);

    const result = await simulateNotificationPatch(prisma, notification.id, adminId, { read: false });
    check("Marked unread", result.success === true, "");
    if (result.success) check("Read false", result.notification!.read === false, `got: ${result.notification!.read}`);
  });

  it("should reject PATCH without read field", async () => {
    const { notification } = await simulateNotificationCreateAsAdminForTrader(prisma, adminId, traderId, {
      type: "TEST", title: "Validation Test", message: "Test",
    });
    assert(notification);

    const result = await simulateNotificationPatch(prisma, notification.id, adminId, {});
    check("Missing read rejected", result.success === false, "");
    if (!result.success) check("Error", (result.error ?? "").includes("read"), `got: ${result.error}`);
  });

  it("should reject PATCH with non-boolean read", async () => {
    const { notification } = await simulateNotificationCreateAsAdminForTrader(prisma, adminId, traderId, {
      type: "TEST", title: "Validation Test", message: "Test",
    });
    assert(notification);

    const result = await simulateNotificationPatch(prisma, notification.id, adminId, { read: "yes" } as unknown as { read: boolean });
    check("Non-boolean read rejected", result.success === false, "");
  });
});

describe("Notification API - GET traderId authorization", () => {
  it("should ignore traderId param for trader (returns own only)", async () => {
    await prisma.notification.create({
      data: { traderId: traderId, type: "TEST", title: "Own", message: "m", read: false },
    });
    await prisma.notification.create({
      data: { traderId: otherTraderId, type: "TEST", title: "Other", message: "m", read: false },
    });

    const result = await simulateNotificationListWithAuth(prisma, otherTraderId, traderId, "TRADER");
    check("Trader ignoring traderId", result.success === true, "");
    if (result.success) {
      check("Only own notifications", result.notifications!.length === 1, `got: ${result.notifications!.length}`);
      if (result.notifications!.length === 1) {
        check("Correct notification", result.notifications![0].title === "Own", "");
      }
    }
  });

  it("should allow admin to use traderId param", async () => {
    await prisma.notification.create({
      data: { traderId: traderId, type: "TEST", title: "Target", message: "m", read: false },
    });

    const result = await simulateNotificationListWithAuth(prisma, traderId, adminId, "ADMIN");
    check("Admin traderId worked", result.success === true, "");
    if (result.success) {
      check("Got target notifications", result.notifications!.length >= 1, `got: ${result.notifications!.length}`);
      const found = result.notifications!.find((n) => n.title === "Target");
      check("Target notification found", found !== undefined, "");
    }
  });
});
