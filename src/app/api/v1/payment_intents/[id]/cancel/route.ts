import { NextResponse } from "next/server";

import { createHandler } from "../../../../../../lib/handler";
import { NotFoundError, ConflictError } from "../../../../../../lib/errors";
import { emitDomainEvent } from "../../../../../../lib/events";
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
      if (pi.status !== "REQUIRES_CONFIRMATION") {
        throw new ConflictError(
          "INVALID_PAYMENT_INTENT_STATE",
          "Payment intent can only be canceled from requires_confirmation status.",
        );
      }

      const canceled = await tx.paymentIntent.update({
        where: { id: pi.id },
        data: { status: "CANCELED" },
      });

      await emitDomainEvent(tx, {
        merchantId: ctx.merchantId,
        type: "payment_intent.canceled",
        entityType: "PaymentIntent",
        entityId: canceled.id,
        payload: serializePaymentIntent(canceled) as Record<string, unknown>,
        actorType: "api_key",
        actorId: ctx.apiKey.id,
      });

      return canceled;
    });

    return NextResponse.json({
      payment_intent: serializePaymentIntent(result),
    });
  },
});
