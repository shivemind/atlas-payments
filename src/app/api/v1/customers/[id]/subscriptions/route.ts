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
import { serializeSubscription } from "../../../../../../lib/serializers";

const listQuerySchema = paginationSchema.extend({
  status: z
    .enum([
      "incomplete",
      "incomplete_expired",
      "trialing",
      "active",
      "past_due",
      "paused",
      "canceled",
      "unpaid",
    ])
    .optional(),
});

export const GET = createHandler({
  auth: "merchant",
  query: listQuerySchema,
  handler: async (ctx) => {
    const customer = await prisma.customer.findFirst({
      where: { id: ctx.params.id, merchantId: ctx.merchantId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundError("CUSTOMER_NOT_FOUND", "Customer not found.");
    }

    const where: Prisma.SubscriptionWhereInput = {
      merchantId: ctx.merchantId,
      customerId: customer.id,
    };
    if (ctx.query.status) {
      where.status = ctx.query.status.toUpperCase() as Prisma.EnumSubscriptionStatusFilter["equals"];
    }

    const skip = paginationSkip(ctx.query);
    const [total, subscriptions] = await Promise.all([
      prisma.subscription.count({ where }),
      prisma.subscription.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: ctx.query.pageSize,
      }),
    ]);

    return NextResponse.json({
      data: subscriptions.map(serializeSubscription),
      pagination: paginationMeta(ctx.query, total),
    });
  },
});
