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
import { serializeInvoice } from "../../../../../../lib/serializers";

const listQuerySchema = paginationSchema.extend({
  status: z.enum(["draft", "open", "paid", "void", "uncollectible", "past_due"]).optional(),
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

    const where: Prisma.InvoiceWhereInput = {
      merchantId: ctx.merchantId,
      customerId: customer.id,
    };
    if (ctx.query.status) {
      where.status = ctx.query.status.toUpperCase() as Prisma.EnumInvoiceStatusFilter["equals"];
    }

    const skip = paginationSkip(ctx.query);
    const [total, invoices] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: ctx.query.pageSize,
      }),
    ]);

    return NextResponse.json({
      data: invoices.map(serializeInvoice),
      pagination: paginationMeta(ctx.query, total),
    });
  },
});
