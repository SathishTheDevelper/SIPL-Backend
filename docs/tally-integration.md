# Tally integration

Status: **Phase 8** (not implemented in Phase 1).

Accounts services will not contain Tally-specific logic.

```
Accounts
  → Accounting integration layer
    → AccountingAdapter
      → TallyPrimeAdapter
      → future SAP / Oracle adapters
```

Outbound work uses `IntegrationOutbox` + BullMQ with exponential backoff and idempotency. Adapter failures must not corrupt account documents.
