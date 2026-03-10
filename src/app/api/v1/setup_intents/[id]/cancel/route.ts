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

const cancelSchema = z.object({
  cancellation_reason: z.string().min(1).max(500).optional(),
});

export const POST = createHandler({
  auth: "merchant",
  validate: cancelSchema,
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

      SetupIntentTransitions.assertTransition(si.status as SIStatus, "CANCELED");

      const canceled = await tx.setupIntent.update({
        where: { id: si.id },
        data: {
          status: "CANCELED",
          cancellationReason: ctx.body.cancellation_reason ?? null,
        },
      });

      await emitDomainEvent(tx, {
        merchantId: ctx.merchantId,
        type: "setup_intent.canceled",
        entityType: "SetupIntent",
        entityId: canceled.id,
        payload: serializeSetupIntent(canceled) as Record<string, unknown>,
        actorType: "api_key",
        actorId: ctx.apiKey.id,
      });

      return canceled;
    });

    return NextResponse.json({ setup_intent: serializeSetupIntent(result) });
  },
});
