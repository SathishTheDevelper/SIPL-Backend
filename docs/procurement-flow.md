# Procurement flow

Status: **Phases 5–6** (not implemented in Phase 1).

```
Approved material request
  → RFQ (multiple vendors)
  → Vendor quotations
  → Comparison statement
  → Vendor selection
  → Purchase approval (APPROVE / SEND_BACK / REJECT; reason required for send-back and reject)
  → PO generation (never before purchase approval)
  → Structured PO charges (not a text field)
  → Workflow-driven PO approval using tenant limits
  → Delivery
  → One PO to many GRNs
```
