import { NextResponse } from "next/server";
import { type Prisma } from "@prisma/client";
import { z } from "zod";
import crypto from "crypto";

import {
  createHandler,
  paginationSchema,
  paginationMeta,
  paginationSkip,
} from "../../../../lib/handler";
import { NotFoundError } from "../../../../lib/errors";
import { emitDomainEvent } from "../../../../lib/events";
import { prisma } from "../../../../lib/prisma";
import { serializePaymentMethod } from "../../../../lib/serializers";

const createPaymentMethodSchema = z.object({
  customer_id: z.string().min(1),
  type: z.enum(["card", "bank_account", "wallet"]).default("card"),
  last4: z.string().length(4).regex(/^\d{4}$/),
  brand: z.string().min(1).max(50).optional(),
  expiry_month: z.number().int().min(1).max(12).optional(),
  expiry_year: z.number().int().min(2024).max(2099).optional(),
  billing_name: z.string().min(1).max(200).optional(),
  billing_email: z.string().email().max(320).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function deterministicStatus(last4: string): "ACTIVE" | "EXPIRED" {
  if (last4.endsWith("5")) return "EXPIRED";
  return "ACTIVE";
}

export const POST = createHandler({
  auth: "merchant",
  idempotent: true,
  validate: createPaymentMethodSchema,
  handler: async (ctx) => {
    const customer = await prisma.customer.findFirst({
      where: { id: ctx.body.customer_id, merchantId: ctx.merchantId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundError("CUSTOMER_NOT_FOUND", "Customer not found.");
    }

    const status = deterministicStatus(ctx.body.last4);
    const fingerprint = crypto
      .createHash("sha256")
      .update(`${ctx.body.type}:${ctx.body.last4}:${ctx.merchantId}`)
      .digest("hex")
      .slice(0, 16);

    const pm = await prisma.$transaction(async (tx) => {
      const created = await tx.paymentMethod.create({
        data: {
          merchantId: ctx.merchantId,
          customerId: ctx.body.customer_id,
          type: ctx.body.type.toUpperCase() as "CARD" | "BANK_ACCOUNT" | "WALLET",
          status,
          last4: ctx.body.last4,
          brand: ctx.body.brand ?? null,
          expiryMonth: ctx.body.expiry_month ?? null,
          expiryYear: ctx.body.expiry_year ?? null,
          fingerprint,
          billingName: ctx.body.billing_name ?? null,
          billingEmail: ctx.body.billing_email ?? null,
          metadata: ctx.body.metadata as Prisma.InputJsonValue | undefined,
        },
      });

      await emitDomainEvent(tx, {
        merchantId: ctx.merchantId,
        type: "payment_method.created",
        entityType: "PaymentMethod",
        entityId: created.id,
        payload: serializePaymentMethod(created) as Record<string, unknown>,
        actorType: "api_key",
        actorId: ctx.apiKey.id,
      });

      return created;
    });

    return NextResponse.json(
      { payment_method: serializePaymentMethod(pm) },
      { status: 201 },
    );
  },
});

const listQuerySchema = paginationSchema.extend({
  customer_id: z.string().optional(),
  type: z.enum(["card", "bank_account", "wallet"]).optional(),
  status: z.enum(["active", "expired", "revoked"]).optional(),
});

export const GET = createHandler({
  auth: "merchant",
  query: listQuerySchema,
  handler: async (ctx) => {
    const where: Prisma.PaymentMethodWhereInput = {
      merchantId: ctx.merchantId,
    };
    if (ctx.query.customer_id) where.customerId = ctx.query.customer_id;
    if (ctx.query.type) where.type = ctx.query.type.toUpperCase() as "CARD" | "BANK_ACCOUNT" | "WALLET";
    if (ctx.query.status) where.status = ctx.query.status.toUpperCase() as "ACTIVE" | "EXPIRED" | "REVOKED";

    const skip = paginationSkip(ctx.query);
    const [total, methods] = await Promise.all([
      prisma.paymentMethod.count({ where }),
      prisma.paymentMethod.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: ctx.query.pageSize,
      }),
    ]);

    return NextResponse.json({
      data: methods.map(serializePaymentMethod),
      pagination: paginationMeta(ctx.query, total),
    });
  },
});
