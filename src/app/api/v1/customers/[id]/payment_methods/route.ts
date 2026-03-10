import { NextResponse } from "next/server";
import { type Prisma } from "@prisma/client";
import { z } from "zod";

import {
  createHandler,
  paginationSchema,
  paginationMeta,
  paginationSkip,
} from "../../../../../../lib/handler";
import { NotFoundError } from "../../../../../../lib/errors";
import { prisma } from "../../../../../../lib/prisma";
import { serializePaymentMethod } from "../../../../../../lib/serializers";

const querySchema = paginationSchema.extend({
  type: z.enum(["card", "bank_account", "wallet"]).optional(),
  status: z.enum(["active", "expired", "revoked"]).optional(),
});

export const GET = createHandler({
  auth: "merchant",
  query: querySchema,
  handler: async (ctx) => {
    const customer = await prisma.customer.findFirst({
      where: { id: ctx.params.id, merchantId: ctx.merchantId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundError("CUSTOMER_NOT_FOUND", "Customer not found.");
    }

    const where: Prisma.PaymentMethodWhereInput = {
      merchantId: ctx.merchantId,
      customerId: ctx.params.id,
    };
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
