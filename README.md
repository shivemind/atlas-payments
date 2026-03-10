# Atlas Payments Service

Core payment processing service for the Atlas platform.

## Domain

- **Customers** — Customer records per merchant
- **Payment Intents** — Full payment lifecycle (create → confirm → capture/cancel)
- **Refunds** — Refund against succeeded payments
- **Payment Methods** — Tokenized card/bank/wallet payment methods
- **Setup Intents** — Attach payment methods without charging
- **Balance** — Ledger-based balance queries
- **Balance Transactions** — Transaction history

## API Routes

All routes under `/api/v1/`:
- `customers`, `customers/[id]`, `customers/[id]/payment_methods`, `customers/[id]/subscriptions`, `customers/[id]/invoices`
- `payment_intents`, `payment_intents/[id]/capture`, `payment_intents/[id]/cancel`
- `refunds`, `refunds/[id]`
- `payment_methods`, `payment_methods/[id]`
- `setup_intents`, `setup_intents/[id]`, `setup_intents/[id]/confirm`, `setup_intents/[id]/cancel`
- `balance`, `balance_transactions`
- `me` (auth identity)

## Setup

```bash
pnpm install
cp .env.example .env
pnpm prisma:migrate:dev
pnpm dev
```

## Port: 3001
