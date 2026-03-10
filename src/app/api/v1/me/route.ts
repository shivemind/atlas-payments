import { NextResponse } from "next/server";

import { createHandler } from "../../../../lib/handler";
import { serializeIdentity } from "../../../../lib/serializers";

export const GET = createHandler({
  auth: "merchant",
  rateLimit: true,
  handler: async (ctx) => {
    return NextResponse.json(serializeIdentity(ctx.merchant, ctx.apiKey));
  },
});
