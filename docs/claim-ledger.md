# Public claim ledger (owner review required)

Status is based on repository behavior, not a production or legal verification. A source-code match does not prove an operational guarantee. Pages: `index.html`, `models.html`, `docs.html`, `privacy.html`, `terms.html`, `status.html`.

| Claim and surface | Evidence and status | P0 treatment / owner follow-up |
|---|---|---|
| Media-only API and no chat, index/models/docs | `worker/index.js` rejects `/v1/chat/completions`; `worker/catalog.js` lists media. Measured locally. | State media scope. |
| One key / no monthly fee / signup credits / credits never expire, index | `worker/auth.js`, `worker/billing.js` and owner plan §1. User-provided and code-supported; live commercial policy Unknown. | Do not quantify signup credit. Confirm production terms. |
| Selling and comparison prices / savings, index/models | `assets/data.js`, `worker/catalog.js`, `scripts/kie-snapshot.json` (2026-10-10). Measured repository snapshot; current Kie pricing Unknown. | Explicit date and Kie comparison-only basis; N/A has no savings. Price-update owner needed. |
| Failed-task refund and $0 failures, index/docs/terms | `worker/tasks.js` `finishTask` returns reserved credits and zeroes task cost on failed status. Measured code; live processing Unknown. | Describe completed failed state rather than unconditional charge-free run. |
| Automatic fallback / authorized hosts / identical vendor output, index | `worker/tasks.js` sends to Kie and polls. No independent evidence of fallback routes, vendor authorization or identical output. Unknown. | Qualified on homepage; obtain contractual proof before reinstating. |
| Upstream processing, index/privacy | `worker/kie.js` and `worker/tasks.js` route via Kie; privacy names individual model providers. Measured code; actual downstream provider list Unknown. | Owner/legal confirm privacy recipient wording. |
| Uptime figures and availability, status | Former `status.html` generated simulated numbers and bars. Not measured uptime. | Removed simulated figures, replaced with monitoring-not-published statement; noindex until live monitoring. |
| Output retention, request logs, no training, index/docs/privacy | `privacy.html` says 14 days / 90 days and no model training. Worker has no evidence of upstream retention or training policy. Unknown. | Qualified index/docs; privacy terms retained pending legal/engineering sign-off. |
| Invoices / VAT / tax treatment, index/terms | Billing UI exists; invoice issuance and tax compliance Unknown. | Qualified homepage FAQ; owner verify invoicing before restoring claim. |
| Concurrency and same-day increase, index/docs | `worker/tasks.js` enforces per-model limit; automatic rise / same-day change Unknown. | Qualified claim. |
| Rights, privacy contact and GDPR response time, privacy | `privacy.html` policy text only. Contact mailbox delivery and legal compliance Unknown. | Retained legal text without inventing new policy; legal owner verification required. |
| Credit cash-refund limitation and account suspension terms, terms | `terms.html` policy only. Legal enforceability Unknown. | Retained; owner/legal review required. |
| Task webhook signatures, retry count, output URLs, docs | `worker/tasks.js` implements signature, callback retry and task response. Measured code; downstream URL lifetime Unknown. | Removed output-link lifetime promise from docs; owner verify policy. |
