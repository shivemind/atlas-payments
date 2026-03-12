import { NextResponse } from "next/server";

import { createHandler } from "../../../../lib/handler";
import { getMerchantBalances } from "../../../../lib/ledger";

export const GET = createHandler({
  auth: "merchant",
  handler: async (ctx) => {
    const balances = await getMerchantBalances(ctx.merchantId);
    return NextResponse.json({
      available: balances.available,
      pending: balances.pending,
      platform_fees: balances.platformFees,
      processor_fees: balances.processorFees,
    });
  },
});
