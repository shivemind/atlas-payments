import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createHandler,
  paginationSchema,
  paginationMeta,
  paginationSkip,
} from "../../../../lib/handler";
import { NotFoundError, ConflictError } from "../../../../lib/errors";
import { emitDomainEvent } from "../../../../lib/events";
import { postRefundSettlement } from "../../../../lib/ledger";
import { prisma } from "../../../../lib/prisma";
import { serializeRefund } from "../../../../lib/serializers";

const createRefundSchema = z.object({
  payment_intent_id: z.string().min(1),
  amount: z.number().int().positive(),
  reason: z.string().max(500).optional(),
});

export const POST = createHandler({
  auth: "merchant",
  validate: createRefundSchema,
  handler: async (ctx) => {
    const refund = await prisma.$transaction(async (tx) => {
      const pi = await tx.paymentIntent.findFirst({
        where: { id: ctx.body.payment_intent_id, merchantId: ctx.merchantId },
      });
      if (!pi) {
        throw new NotFoundError(
          "PAYMENT_INTENT_NOT_FOUND",
          "Payment intent not found.",
        );
      }
      if (!pi.capturedAt) {
        throw new ConflictError(
          "INVALID_PAYMENT_INTENT_STATE",
          "Refunds are only allowed for captured payment intents.",
        );
      }

      const totals = await tx.refund.aggregate({
        where: {
          merchantId: ctx.merchantId,
          paymentIntentId: pi.id,
          status: "SUCCEEDED",
        },
        _sum: { amount: true },
      });
      const remaining = pi.amount - (totals._sum.amount ?? 0);
      if (ctx.body.amount > remaining) {
        throw new ConflictError(
          "REFUND_AMOUNT_EXCEEDS_AVAILABLE",
          "Refund amount exceeds remaining refundable amount.",
        );
      }

      const created = await tx.refund.create({
        data: {
          merchantId: ctx.merchantId,
          paymentIntentId: pi.id,
          amount: ctx.body.amount,
          status: "SUCCEEDED",
          reason: ctx.body.reason,
        },
      });

      await postRefundSettlement({
        merchantId: ctx.merchantId,
        amount: created.amount,
        currency: pi.currency,
        reference: `refund:${created.id}`,
        prismaClient: tx,
      });

      const payload = serializeRefund(created) as Record<string, unknown>;

      await emitDomainEvent(tx, {
        merchantId: ctx.merchantId,
        type: "refund.created",
        entityType: "Refund",
        entityId: created.id,
        payload,
        actorType: "api_key",
        actorId: ctx.apiKey.id,
      });

      await emitDomainEvent(tx, {
        merchantId: ctx.merchantId,
        type: "refund.succeeded",
        entityType: "Refund",
        entityId: created.id,
        payload,
        actorType: "api_key",
        actorId: ctx.apiKey.id,
      });

      return created;
    });

    return NextResponse.json(
      { refund: serializeRefund(refund) },
      { status: 201 },
    );
  },
});

export const GET = createHandler({
  auth: "merchant",
  query: paginationSchema,
  handler: async (ctx) => {
    const skip = paginationSkip(ctx.query);
    const [total, refunds] = await Promise.all([
      prisma.refund.count({ where: { merchantId: ctx.merchantId } }),
      prisma.refund.findMany({
        where: { merchantId: ctx.merchantId },
        orderBy: { createdAt: "desc" },
        skip,
        take: ctx.query.pageSize,
      }),
    ]);
    return NextResponse.json({
      data: refunds.map(serializeRefund),
      pagination: paginationMeta(ctx.query, total),
    });
  },
});
