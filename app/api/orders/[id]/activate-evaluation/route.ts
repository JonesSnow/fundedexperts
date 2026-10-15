import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie, getSession } from "@/lib/auth/session";
import { createLogger, generateCorrelationId } from "@/lib/logger";
import { prisma } from "@/lib/db";
import { checkOrderActivationRateLimit } from "@/lib/order-activation-rate-limit";
import { prismaActivationRepository } from "@/lib/evaluation-activation";
import { handlePaidOrderActivation } from "@/lib/evaluation-activation-response";

const logger = createLogger({
  environment: (process.env.NODE_ENV ?? "development") as "development" | "production" | "test",
});

async function getAuthenticatedUser(request: NextRequest) {
  const token = getSessionCookie(request);
  if (!token) return null;
  const session = await getSession(token);
  if (!session) return null;
  const trader = await prisma.trader.findUnique({
    where: { id: session.sub },
    select: { id: true, role: true, status: true },
  });
  if (!trader || trader.status === "SUSPENDED" || trader.status === "INACTIVE") return null;
  return trader;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const correlationId = generateCorrelationId();
  const { id } = await params;
  const trader = await getAuthenticatedUser(request);
  if (!trader) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const rateLimit = checkOrderActivationRateLimit(trader.id);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many attempts" },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
      );
    }

    const response = await handlePaidOrderActivation(prismaActivationRepository(prisma), { orderId: id, traderId: trader.id });
    if (!response.ok) logger.warn("ACTIVATION", "Paid order activation rejected", { correlationId, actor: { type: "trader", id: trader.id }, entity: { type: "Order", id } });
    return response;
  } catch {
    logger.error("ACTIVATION", "Paid order activation failed", {
      correlationId,
      actor: { type: "trader", id: trader.id },
      entity: { type: "Order", id },
      error: { code: "ACTIVATION_FAILED", message: "Activation transaction failed" },
    });
    return NextResponse.json({ success: false, error: "Failed to activate evaluation" }, { status: 500 });
  }
}
