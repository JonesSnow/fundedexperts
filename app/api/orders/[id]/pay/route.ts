import { NextResponse } from "next/server";

/**
 * Payment confirmation stays disabled until a real provider can verify the
 * transaction. No request data may mark an order as paid.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  void request;
  void context;
  return NextResponse.json(
    { success: false, error: "Payments are not available yet" },
    { status: 503 },
  );
}
