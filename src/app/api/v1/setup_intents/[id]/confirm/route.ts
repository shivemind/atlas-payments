import { NextResponse } from "next/server";
import { z } from "zod";

import { createHandler } from "../../../../../../lib/handler";
import { NotFoundError } from "../../../../../../lib/errors";
import { emitDomainEvent } from "../../../../../../lib/events";
import { prisma } from "../../../../../../lib/prisma";
import { serializeSetupIntent } from "../../../../../../lib/serializers";
import { defineTransitions } from "../../../../../../lib/state-machine";

type SIStatus = "CREATED" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "CANCELED";

const SetupIntentTransitions = defineTransitions<SIStatus>({
  CREATED: ["PROCESSING", "CANCELED"],
  PROCESSING: ["SUCCEEDED", "FAILED"],
});

const confirmSchema = z.object({
  payment_method_id: z.string().min(1),
});

function deterministicOutcome(last4: string | null): "SUCCEEDED" | "FAILED" {
  if (last4?.endsWith("5")) return "FAILED";
  return "SUCCEEDED";
}

export const POST = createHandler({
  auth: "merchant",
  validate: confirmSchema,
  handler: async (ctx) => {
    const result = await prisma.$transaction(async (tx) => {
      const si = await tx.setupIntent.findFirst({
        where: { id: ctx.params.id, merchantId: ctx.merchantId },
      });
      if (!si) {
        throw new NotFoundError(
          "SETUP_INTENT_NOT_FOUND",
          "Setup intent not found.",
        );
      }

      SetupIntentTransitions.assertTransition(si.status as SIStatus, "PROCESSING");

      const pm = await tx.paymentMethod.findFirst({
        where: {
          id: ctx.body.payment_method_id,
          merchantId: ctx.merchantId,
        },
      });
      if (!pm) {
        throw new NotFoundError(
          "PAYMENT_METHOD_NOT_FOUND",
          "Payment method not found.",
        );
      }

      await tx.setupIntent.update({
        where: { id: si.id },
        data: { status: "PROCESSING", paymentMethodId: pm.id },
      });

      const finalStatus = deterministicOutcome(pm.last4);
      SetupIntentTransitions.assertTransition("PROCESSING", finalStatus);

      const confirmed = await tx.setupIntent.update({
        where: { id: si.id },
        data: { status: finalStatus },
      });

      const eventType =
        finalStatus === "SUCCEEDED"
          ? "setup_intent.succeeded"
          : "setup_intent.failed";

      await emitDomainEvent(tx, {
        merchantId: ctx.merchantId,
        type: eventType,
        entityType: "SetupIntent",
        entityId: confirmed.id,
        payload: serializeSetupIntent(confirmed) as Record<string, unknown>,
        actorType: "api_key",
        actorId: ctx.apiKey.id,
      });

      return confirmed;
    });

    return NextResponse.json({ setup_intent: serializeSetupIntent(result) });
  },
});
