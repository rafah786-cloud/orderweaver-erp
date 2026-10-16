# Business management domain helpers
Date: 2026-10-16

Pure TypeScript modules added for day-to-day ERP operations. They do **not** post to the ledger or invent balances; screens and server functions must feed verified posted figures.

| Module | Path | Use |
|--------|------|-----|
| Credit control | `src/lib/credit-control.ts` | Block/warn on new invoices using ₹1.5L hard limit and 90-day / ₹50k aged rule |
| Receivable ageing | `src/lib/receivable-ageing.ts` | Bucket open bills into Current / 1–30 / 31–60 / 61–90 / 90+ |
| Month-end close | `src/lib/month-end-close.ts` | Checklist before period lock (bank, AR/AP, stock, WIP, GST, payroll, TB, backup) |
| Leave balance | `src/lib/leave-balance.ts` | Accrual and request evaluation for casual/sick/earned/unpaid |

## Integration guidance

1. **Credit control** — call `evaluatePartyCredit` from invoice creation after loading bill-wise outstanding from posted activity; surface `creditBlockMessage` when blocked.
2. **Ageing** — feed `OpenBillBalance[]` from AR query; render `AgeingReport.rows` on accounting/collections pages.
3. **Month-end** — admin/accountant UI can track task status; **period lock** remains an admin server operation.
4. **Leave** — HR screens compute available balance before submitting a leave request document.

## Tests

- `src/lib/credit-control.test.ts`
- `src/lib/receivable-ageing.test.ts`
- `src/lib/month-end-close.test.ts`
- `src/lib/leave-balance.test.ts`

Run: `bun run test`
