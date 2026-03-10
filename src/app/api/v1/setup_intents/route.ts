import { NextResponse } from "next/server";
import { type Prisma } from "@prisma/client";
import { z } from "zod";

import {
  createHandler,
  paginationSchema,
  paginationMeta,
  paginationSkip,
} from "../../../../lib/handler";
import { NotFoundError } from "../../../../lib/errors";
import { emitDomainEvent } from "../../../../lib/events";
import { prisma } from "../../../../lib/prisma";
import { serializeSetupIntent } from "../../../../lib/serializers";

const createSetupIntentSchema = z.object({
  customer_id: z.string().min(1),
  usage: z.enum(["off_session", "on_session"]).default("off_session"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const POST = createHandler({
  auth: "merchant",
  idempotent: true,
  validate: createSetupIntentSchema,
  handler: async (ctx) => {
    const customer = await prisma.customer.findFirst({
      where: { id: ctx.body.customer_id, merchantId: ctx.merchantId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundError("CUSTOMER_NOT_FOUND", "Customer not found.");
    }

    const si = await prisma.$transaction(async (tx) => {
      const created = await tx.setupIntent.create({
        data: {
          merchantId: ctx.merchantId,
          customerId: ctx.body.customer_id,
          status: "CREATED",
          usage: ctx.body.usage,
          metadata: ctx.body.metadata as Prisma.InputJsonValue | undefined,
        },
      });

      await emitDomainEvent(tx, {
        merchantId: ctx.merchantId,
        type: "setup_intent.created",
        entityType: "SetupIntent",
        entityId: created.id,
        payload: serializeSetupIntent(created) as Record<string, unknown>,
        actorType: "api_key",
        actorId: ctx.apiKey.id,
      });

      return created;
    });

    return NextResponse.json(
      { setup_intent: serializeSetupIntent(si) },
      { status: 201 },
    );
  },
});

const listQuerySchema = paginationSchema.extend({
  customer_id: z.string().optional(),
  status: z
    .enum(["created", "processing", "succeeded", "failed", "canceled"])
    .optional(),
});

export const GET = createHandler({
  auth: "merchant",
  query: listQuerySchema,
  handler: async (ctx) => {
    const where: Prisma.SetupIntentWhereInput = {
      merchantId: ctx.merchantId,
    };
    if (ctx.query.customer_id) where.customerId = ctx.query.customer_id;
    if (ctx.query.status) where.status = ctx.query.status.toUpperCase() as Prisma.EnumSetupIntentStatusFilter;

    const skip = paginationSkip(ctx.query);
    const [total, intents] = await Promise.all([
      prisma.setupIntent.count({ where }),
      prisma.setupIntent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: ctx.query.pageSize,
      }),
    ]);

    return NextResponse.json({
      data: intents.map(serializeSetupIntent),
      pagination: paginationMeta(ctx.query, total),
    });
  },
});
