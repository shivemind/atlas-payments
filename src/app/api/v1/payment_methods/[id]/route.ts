import { NextResponse } from "next/server";
import { type Prisma } from "@prisma/client";
import { z } from "zod";

import { createHandler } from "../../../../../lib/handler";
import { NotFoundError, ConflictError } from "../../../../../lib/errors";
import { emitDomainEvent } from "../../../../../lib/events";
import { prisma } from "../../../../../lib/prisma";
import { serializePaymentMethod } from "../../../../../lib/serializers";

export const GET = createHandler({
  auth: "merchant",
  handler: async (ctx) => {
    const pm = await prisma.paymentMethod.findFirst({
      where: { id: ctx.params.id, merchantId: ctx.merchantId },
    });
    if (!pm) {
      throw new NotFoundError(
        "PAYMENT_METHOD_NOT_FOUND",
        "Payment method not found.",
      );
    }
    return NextResponse.json({ payment_method: serializePaymentMethod(pm) });
  },
});

const updatePaymentMethodSchema = z.object({
  billing_name: z.string().min(1).max(200).optional(),
  billing_email: z.string().email().max(320).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const PATCH = createHandler({
  auth: "merchant",
  validate: updatePaymentMethodSchema,
  handler: async (ctx) => {
    const result = await prisma.$transaction(async (tx) => {
      const pm = await tx.paymentMethod.findFirst({
        where: { id: ctx.params.id, merchantId: ctx.merchantId },
      });
      if (!pm) {
        throw new NotFoundError(
          "PAYMENT_METHOD_NOT_FOUND",
          "Payment method not found.",
        );
      }
      if (pm.status === "REVOKED") {
        throw new ConflictError(
          "PAYMENT_METHOD_REVOKED",
          "Cannot update a revoked payment method.",
        );
      }

      const data: Prisma.PaymentMethodUpdateInput = {};
      if (ctx.body.billing_name !== undefined) data.billingName = ctx.body.billing_name;
      if (ctx.body.billing_email !== undefined) data.billingEmail = ctx.body.billing_email;
      if (ctx.body.metadata !== undefined) data.metadata = ctx.body.metadata as Prisma.InputJsonValue;

      const updated = await tx.paymentMethod.update({
        where: { id: pm.id },
        data,
      });

      await emitDomainEvent(tx, {
        merchantId: ctx.merchantId,
        type: "payment_method.updated",
        entityType: "PaymentMethod",
        entityId: updated.id,
        payload: serializePaymentMethod(updated) as Record<string, unknown>,
        actorType: "api_key",
        actorId: ctx.apiKey.id,
      });

      return updated;
    });

    return NextResponse.json({ payment_method: serializePaymentMethod(result) });
  },
});

export const DELETE = createHandler({
  auth: "merchant",
  handler: async (ctx) => {
    const result = await prisma.$transaction(async (tx) => {
      const pm = await tx.paymentMethod.findFirst({
        where: { id: ctx.params.id, merchantId: ctx.merchantId },
      });
      if (!pm) {
        throw new NotFoundError(
          "PAYMENT_METHOD_NOT_FOUND",
          "Payment method not found.",
        );
      }
      if (pm.status === "REVOKED") {
        throw new ConflictError(
          "PAYMENT_METHOD_ALREADY_REVOKED",
          "Payment method is already revoked.",
        );
      }

      const revoked = await tx.paymentMethod.update({
        where: { id: pm.id },
        data: { status: "REVOKED" },
      });

      await emitDomainEvent(tx, {
        merchantId: ctx.merchantId,
        type: "payment_method.revoked",
        entityType: "PaymentMethod",
        entityId: revoked.id,
        payload: serializePaymentMethod(revoked) as Record<string, unknown>,
        actorType: "api_key",
        actorId: ctx.apiKey.id,
      });

      return revoked;
    });

    return NextResponse.json({ payment_method: serializePaymentMethod(result) });
  },
});
