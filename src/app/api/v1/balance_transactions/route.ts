import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createHandler,
  paginationMeta,
} from "../../../../lib/handler";
import { prisma } from "../../../../lib/prisma";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  type: z.enum(["all", "confirm", "capture", "refund", "other"]).default("all"),
});

type TxType = "confirm" | "capture" | "refund" | "other";

function inferType(reference: string | null): TxType {
  if (!reference) return "other";
  if (reference.startsWith("pi_confirm:")) return "confirm";
  if (reference.startsWith("pi_capture:")) return "capture";
  if (reference.startsWith("refund:")) return "refund";
  return "other";
}

export const GET = createHandler({
  auth: "merchant",
  query: querySchema,
  handler: async (ctx) => {
    const { page, pageSize, from, to, type } = ctx.query;

    const entries = await prisma.ledgerJournalEntry.findMany({
      where: {
        merchantId: ctx.merchantId,
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        lines: {
          include: { account: { select: { code: true } } },
        },
      },
    });

    const mapped = entries.map((e) => {
      const debitTotal = e.lines
        .filter((l) => l.direction === "DEBIT")
        .reduce((s, l) => s + l.amount, 0);
      const creditTotal = e.lines
        .filter((l) => l.direction === "CREDIT")
        .reduce((s, l) => s + l.amount, 0);
      const txType = inferType(e.reference);
      return {
        id: e.id,
        reference: e.reference,
        description: e.description,
        type: txType,
        status: e.status.toLowerCase(),
        posted_at: e.postedAt?.toISOString() ?? null,
        created_at: e.createdAt.toISOString(),
        debit_total: debitTotal,
        credit_total: creditTotal,
        lines: e.lines.map((l) => ({
          id: l.id,
          direction: l.direction.toLowerCase(),
          amount: l.amount,
          account_code: l.account.code,
        })),
      };
    });

    const filtered =
      type === "all" ? mapped : mapped.filter((t) => t.type === type);
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const data = filtered.slice(start, start + pageSize);

    return NextResponse.json({
      data,
      pagination: paginationMeta({ page, pageSize }, total),
    });
  },
});
