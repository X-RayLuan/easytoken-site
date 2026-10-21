# Public claim ledger (owner review required)

Status is based on repository behavior, not a production or legal verification. A source-code match does not prove an operational guarantee. Pages: `index.html`, `models.html`, `docs.html`, `privacy.html`, `terms.html`, `status.html`.

| Claim and surface | Evidence and status | P0 treatment / owner follow-up |
|---|---|---|
| Media-only API and no chat, index/models/docs | `worker/index.js` rejects `/v1/chat/completions`; `worker/catalog.js` lists media. Measured locally. | State media scope. |
| One key / no monthly fee / signup credits / credits never expire, index | `worker/auth.js`, `worker/billing.js` and owner plan §1. User-provided and code-supported; live commercial policy Unknown. | Do not quantify signup credit. Confirm production terms. |
| Selling and comparison prices / savings, index/models | `assets/data.js`, `worker/catalog.js`, `scripts/kie-snapshot.json` (2026-10-10). Measured repository snapshot; current Kie pricing Unknown. | Explicit date and Kie comparison-only basis; N/A has no savings. Price snapshot owner: Ray Luan (owner decision 2026-10-19). Freshness of live Kie prices Unknown. |
| Failed-task refund and $0 failures, index/docs/terms | `worker/tasks.js` `finishTask` returns reserved credits and zeroes task cost on failed status. Measured code; live processing Unknown. | Describe completed failed state rather than unconditional charge-free run. |
| Automatic fallback / authorized hosts / identical vendor output, index | `worker/tasks.js` sends to Kie and polls. No independent evidence of fallback routes, vendor authorization or identical output. Unknown. | Qualified on homepage; obtain contractual proof before reinstating. |
| Upstream processing, index/privacy | `worker/kie.js` and `worker/tasks.js` route via Kie; privacy names individual model providers. Measured code; actual downstream provider list Unknown. | Owner/legal confirm privacy recipient wording. |
| Uptime figures and availability, status | Former `status.html` generated simulated numbers and bars. Not measured uptime. | Removed simulated figures, replaced with monitoring-not-published statement; noindex until live monitoring. |
| Output retention, request logs, no training, index/docs/privacy | `privacy.html` says 14 days / 90 days and no model training. Worker has no evidence of upstream retention or training policy. Unknown. | Qualified index/docs; Removed unverified fixed retention and no-training promises from privacy; upstream retention and training policy Unknown; owner/legal confirmation still needed. |
| Invoices / VAT / tax treatment, index/terms | Billing UI exists; invoice issuance and tax compliance Unknown. | Qualified homepage FAQ; owner verify invoicing before restoring claim. |
| Concurrency and same-day increase, index/docs | `worker/tasks.js` enforces per-model limit; automatic rise / same-day change Unknown. | Qualified claim. |
| Rights, privacy contact and GDPR response time, privacy | `privacy.html` policy text only. Contact mailbox delivery and legal compliance Unknown. | Removed specific GDPR response-time and regional-authority promises; contact is owner-provided hello@easytoken.si; legal owner review still required. |
| Credit cash-refund limitation and account suspension terms, terms | `terms.html` policy only. Legal enforceability Unknown. | Removed unsupported cash-refund limitation and suspension specifics; owner/legal review still required. |
| Task webhook signatures, retry count, output URLs, docs | `worker/tasks.js` implements signature, callback retry and task response. Measured code; downstream URL lifetime Unknown. | Removed output-link lifetime promise from docs; owner verify policy. |

## Owner decisions applied, 2026-10-19 (user-provided)

- Legal templates: modeled on live https://easyveo.com/privacy and https://easyveo.com/terms, rewritten for EasyToken media API. Legal enforceability and approval are Unknown.
- Price snapshot owner: Ray Luan. Snapshot date 2026-10-10 is repository evidence (`scripts/kie-snapshot.json`); live Kie price freshness Unknown.
- `.html` canonicals remain; no alias migration.
- Ray Chief decision: utility pages retain `noindex,follow`. `robots.txt` explicitly allows search, AI retrieval and AI training user agents; only `/api/` and `/v1/` disallowed. Utility HTML not disallowed so crawlers can observe `noindex,follow`. Robots directives do not override Cloudflare bot settings; actual edge behavior Unknown.
- Legal entity AI AGENT AUTOMATION LLC, address 30 N Gould St Ste R, Sheridan, WY 82801, USA; contact hello@easytoken.si. Owner-provided, not independently verified. Footer is raw HTML on public pages and shared JS on enhanced pages; homepage has Organization JSON-LD.

### Outstanding legal / engineering confirmation

- Confirm current data storage and deletion practices, upstream provider policies and whether providers train on submitted media; no fixed retention or no-training promise is published here.
- Confirm the legal review of refund handling for credit purchases, applicable rights, account enforcement and Terms and Privacy wording. Worker `finishTask` refunds reserved credits only on terminal failed jobs; it is not a cash-purchase refund.
- `worker/kie.js` still emits an output-link lifetime note that is not supported by a verified upstream contract. Align API messaging after provider confirmation.
- Verify Cloudflare preview sitemap and static-asset routing, `api.easytoken.si/` root behavior, and any remaining unproven claims before merge.
