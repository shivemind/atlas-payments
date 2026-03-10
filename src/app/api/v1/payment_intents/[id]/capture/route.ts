import { NextResponse } from "next/server";

import { createHandler } from "../../../../../../lib/handler";
import { NotFoundError, ConflictError } from "../../../../../../lib/errors";
import { emitDomainEvent } from "../../../../../../lib/events";
import { postCaptureSettlement } from "../../../../../../lib/ledger";
import { prisma } from "../../../../../../lib/prisma";
import { serializePaymentIntent } from "../../../../../../lib/serializers";

export const POST = createHandler({
  auth: "merchant",
  handler: async (ctx) => {
    const result = await prisma.$transaction(async (tx) => {
      const pi = await tx.paymentIntent.findFirst({
        where: { id: ctx.params.id, merchantId: ctx.merchantId },
      });
      if (!pi) {
        throw new NotFoundError(
          "PAYMENT_INTENT_NOT_FOUND",
          "Payment intent not found.",
        );
      }
      if (pi.status !== "SUCCEEDED") {
        throw new ConflictError(
          "INVALID_PAYMENT_INTENT_STATE",
          "Payment intent must be in succeeded status before capture.",
        );
      }
      if (pi.capturedAt) {
        throw new ConflictError(
          "INVALID_PAYMENT_INTENT_STATE",
          "Payment intent is already captured.",
        );
      }

      const captured = await tx.paymentIntent.update({
        where: { id: pi.id },
        data: { capturedAt: new Date() },
      });

      await postCaptureSettlement({
        merchantId: ctx.merchantId,
        amount: pi.amount,
        currency: pi.currency,
        reference: `pi_capture:${pi.id}`,
        prismaClient: tx,
      });

      await emitDomainEvent(tx, {
        merchantId: ctx.merchantId,
        type: "payment_intent.succeeded",
        entityType: "PaymentIntent",
        entityId: captured.id,
        payload: serializePaymentIntent(captured) as Record<string, unknown>,
        actorType: "api_key",
        actorId: ctx.apiKey.id,
      });

      return captured;
    });

    return NextResponse.json({
      payment_intent: serializePaymentIntent(result),
    });
  },
});
