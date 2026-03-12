import { NextResponse } from "next/server";

import { createHandler } from "../../../../../lib/handler";
import { NotFoundError } from "../../../../../lib/errors";
import { prisma } from "../../../../../lib/prisma";
import { serializeSetupIntent } from "../../../../../lib/serializers";

export const GET = createHandler({
  auth: "merchant",
  handler: async (ctx) => {
    const si = await prisma.setupIntent.findFirst({
      where: { id: ctx.params.id, merchantId: ctx.merchantId },
    });
    if (!si) {
      throw new NotFoundError(
        "SETUP_INTENT_NOT_FOUND",
        "Setup intent not found.",
      );
    }
    return NextResponse.json({ setup_intent: serializeSetupIntent(si) });
  },
});
