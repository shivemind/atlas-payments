import { NextResponse } from "next/server";

import { createHandler } from "../../../../../lib/handler";
import { NotFoundError } from "../../../../../lib/errors";
import { prisma } from "../../../../../lib/prisma";
import { serializeRefund } from "../../../../../lib/serializers";

export const GET = createHandler({
  auth: "merchant",
  handler: async (ctx) => {
    const refund = await prisma.refund.findFirst({
      where: { id: ctx.params.id, merchantId: ctx.merchantId },
    });
    if (!refund) {
      throw new NotFoundError("REFUND_NOT_FOUND", "Refund not found.");
    }
    return NextResponse.json({ refund: serializeRefund(refund) });
  },
});
