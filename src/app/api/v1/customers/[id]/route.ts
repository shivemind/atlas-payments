import { NextResponse } from "next/server";

import { createHandler } from "../../../../../lib/handler";
import { NotFoundError } from "../../../../../lib/errors";
import { prisma } from "../../../../../lib/prisma";
import { serializeCustomer } from "../../../../../lib/serializers";

export const GET = createHandler({
  auth: "merchant",
  handler: async (ctx) => {
    const customer = await prisma.customer.findFirst({
      where: { id: ctx.params.id, merchantId: ctx.merchantId },
    });
    if (!customer) {
      throw new NotFoundError("CUSTOMER_NOT_FOUND", "Customer not found.");
    }
    return NextResponse.json({ customer: serializeCustomer(customer) });
  },
});
