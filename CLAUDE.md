# ERPNext & QuickBooks MCP Server

## Project Overview
MCP (Model Context Protocol) servers for accessing ERPNext and QuickBooks Online financial data. Used for internal accounting, tax preparation, and financial reporting for Cameron One Inc. and affiliated entities.

## Architecture
- **ERPNext MCP Server**: `src/index.ts` — connects to ERPNext/Frappe instance via API key auth
- **QuickBooks MCP Server**: `src/quickbooks/index.ts` — connects to QuickBooks Online via OAuth 2.0
  - `src/quickbooks/client.ts` — API client with auto token refresh
  - `src/quickbooks/oauth-setup.ts` — automatic OAuth flow (requires localhost redirect URI)
  - `src/quickbooks/oauth-manual.ts` — manual OAuth flow using Intuit's playground redirect URI
- Both servers use `StdioServerTransport` from `@modelcontextprotocol/sdk`
- TypeScript compiled to `build/` directory

## Environment & Auth
- ERPNext: credentials in `../FinancialIntelligencer/.env`, loaded via `start.sh`
- QuickBooks: credentials in `.env` (gitignored), loaded via `dotenv/config`
  - `QB_CLIENT_ID` and `QB_CLIENT_SECRET` from Intuit Developer portal
  - OAuth tokens stored at `~/.quickbooks-tokens.json` (auto-refreshed)
- Mercury Bank API: `MERCURY_API_TOKEN_CO` and `MERCURY_API_TOKEN_CHP` in `../FinancialIntelligencer/.env`
- `.mcp.json` configures both MCP servers for Claude Code (hardcoded paths, gitignored)
  - ERPNext server uses `start.sh` wrapper (loads env from `../FinancialIntelligencer/.env`)
  - QuickBooks server runs `build/quickbooks/index.js` directly (uses local `.env`)

## Build & Run
```bash
npm run build          # Compile TypeScript
npm run qb:auth        # OAuth setup (auto, needs localhost redirect URI)
npm run qb:auth:manual # OAuth setup (manual, uses Intuit playground redirect)
npm run inspector      # Debug ERPNext MCP server
npm run inspector:qb   # Debug QuickBooks MCP server
```

## Connected Entities

| Entity | System | Notes |
|--------|--------|-------|
| Cameron One Inc. (CO) | ERPNext | Holding company. Mercury Checking CP-0942. |
| Cameron Healthcare Partners LLC (CHP) | ERPNext | MSO / management services. Mercury Checking CHP-4128. |
| Integrative Medicine Psychiatry PC (IMPC) | QuickBooks Online | Medical practice. Realm ID: 9130354730339976. Chase bank accounts. |

### Intercompany Relationships
- CHP provides MSO services to IMPC at $60,000/month ($360K/year for 2025)
- CHP records revenue in `311007 - Administrative Fee (MSO Services)`; IMPC records expense as `Management Services Fee (to MSO)` and payable in `MSO Fee Payable` (QBO account 1150040011)
- Cash transfers between CHP and IMPC flow through Mercury (CHP side) and Chase (IMPC side)
- On IMPC's QBO books, all intercompany cash movements (in and out) are classified to `MSO Fee Payable` (AP sub-account 1150040011)
- CO funds CHP via equity investments tracked in `510009 - Cameron One Inc. Equity Investment` (CHP) / `218000 - Subscription Payable` (CO)

## MCP Tools

### ERPNext Tools
`get_doctypes`, `get_doctype_fields`, `get_documents`, `create_document`, `update_document`, `run_report`

### QuickBooks Tools
**Read:** `qb_balance_sheet`, `qb_trial_balance`, `qb_general_ledger`, `qb_profit_and_loss`, `qb_comparative_balance_sheet`, `qb_comparative_income_statement`, `qb_accounts`, `qb_query`, `qb_vendors`, `qb_customers`, `qb_employees`, `qb_company_info`

**Write:** `qb_create_bill`, `qb_create_journal_entry`, `qb_update_entity`

## Data Flow: Bank Transactions (Mercury → ERPNext)

### Source
Mercury Bank API (`https://backend.mercury.com/api/v1/`)
- CO account: use `MERCURY_API_TOKEN_CO`
- CHP account ID: `81bb0e70-fb9d-11ef-91cc-5bd471b9b8a4`, use `MERCURY_API_TOKEN_CHP`

### Import Scripts (in `../FinancialIntelligencer/`)

1. **`convert_mercury.py`** — Primary bank import. Converts Mercury CSV export → ERPNext Journal Entries.
   - Input: Mercury CSV export (downloaded from Mercury dashboard), company selection (CO or CHP)
   - Uses description-based and account-number-based cost center mapping
   - Posts directly to ERPNext API or exports flat CSV
   - CHP healthcare expenses (KMG carrier) get special 3-line split entries

2. **`fetch_mercury_transfers.py`** — Catches transactions missing from CSV exports: intercompany transfers (CO↔CHP) and CC autopay payments.
   - Input: Mercury API tokens, date range
   - Creates paired JEs (one for each entity perspective)
   - Flags transfers ≥$10,000 as likely equity contributions (requires manual confirmation)

3. **`reconcile_bank.py`** — Bank reconciliation. Compares ERPNext GL (account 111006) vs Mercury API month-end balances.
   - Useful for identifying missing imports
   - Known gap: CHP routes credit card charges through Mercury Checking for simplification (CC paid off monthly, so net cash effect is the same). This inflates both debit and credit totals vs actual bank but washes out at month-end.

### CHP Accounting Convention
CHP records expenses on a cash basis — each bank transaction becomes a Journal Entry (DR expense / CR Mercury Checking). Credit card charges are also routed through Mercury Checking rather than a CC liability account, since the CC is paid off monthly. This means ERPNext Mercury Checking activity is higher than actual bank activity, but the month-end balance difference is small and predictable.

## Data Flow: Payroll (Rippling → ERPNext)

### Source
Rippling payroll accounting export CSVs, downloaded from Rippling dashboard per pay period.

### Import Process
1. Download "Cameron Healthcare Partners LLC accounting export" CSV from Rippling for each pay period
2. Save to `../FinancialIntelligencer/input/` with naming convention: `YYYY.MM.DD_Cameron Healthcare Partners LLC accounting export.csv`
3. Run `../FinancialIntelligencer/convert_rippling.py` to convert to ERPNext Journal Entries

### Script Details
**`convert_rippling.py`** — Converts Rippling CSV to ERPNext JEs, grouping by pay date (one JE per payroll run).
- Input: Rippling CSV with columns: Date, Account, Debit, Credit, Memo, Entry Number
- Maps Rippling account names → ERPNext account codes using memo patterns + account-number prefix fallback
- Posts directly to ERPNext API

### Payroll Clearing Pattern (May 2025 onward)
Starting ~May 2025, payroll uses a two-step pattern:
1. Mercury bank charge (Rippling debit) → DR `211799 - Payroll Clearing Account` / CR `111006 - Mercury Checking`
2. Rippling accounting export resolves it → DR expense accounts (salary, taxes) / CR `211799 - Payroll Clearing`

Earlier months (Feb–Apr 2025) used a direct approach: DR expense / CR Mercury Checking in a single JE.

### Payroll Deduction Vendors
- **Rippling Payments** — Main payroll (salary + tax withholdings). Two transactions per pay period (split by employee group).
- **BENEFITHEALTHPLA / KMG** — Medical/dental insurance (employer + employee portions). Maps to `420153 - Medical Deductions - Employer Contribution` and `211711/211721 - Medical Deductions Liabilities`.
- **Nu Era Benefits** — Dental deductions. Maps to `211722 - Dental Deductions - Employee Deduction Liabilities`.
- **PEOPLE CENTER** — Rippling's payroll processing fees. Maps to `420101 - Payroll Service Fees`.
- **SHELTERPOINT** — Workers comp insurance.

### Input File Locations
```
../FinancialIntelligencer/input/
  2025_oct_rippling/    # Oct pay period exports
  2025_nov_rippling/    # Nov pay period exports
  2025_12_dec/          # Dec pay period exports
  YYYY.MM.DD_Cameron Healthcare Partners LLC accounting export.csv  # Individual pay periods
```

## Data Flow: Payroll (Justworks + Rippling → IMPC/QBO)

### Source
IMPC uses two payroll providers:
- **Justworks** (PEO) — Justworks is the employer of record and files payroll taxes under Justworks' EIN, not IMPC's
- **Rippling** (non-PEO) — Rippling is the payroll processor only; payroll taxes are filed under IMPC's EIN

### Import Process
- **Justworks** payroll: transactions appear as bank feed items in the Chase checking account and are categorized in QBO
- **Rippling** payroll: auto-syncs to QBO via Rippling's built-in accounting integration (no manual CSV export needed — unlike CHP which requires manual export for ERPNext)

### BigQuery Analytics
**`../claude_mcp/src/load_justworks_to_bq.py`** — Loads Justworks invoice detail CSVs to BigQuery (`integrative-mind-dw.justworks_payroll.invoice_details`) for analysis and reconciliation.
- Input: Justworks Invoice Detail CSVs (17 columns)
- Used for payroll reconciliation reports, not for direct ERPNext/QBO import

## Data Flow: Expense Data (Credit Cards / Misc)

### CHP Expenses
- Mercury debit card transactions and ACH payments appear in Mercury CSV exports → imported via `convert_mercury.py`
- Credit card charges (Google Ads, Meta Ads, WeWork, software subscriptions, etc.) are recorded as JEs against Mercury Checking directly (simplified approach)
- The Mercury Credit Card (CP) for Cameron One is tracked in `212004 - Mercury Credit Card (CP) - CO` with autopay settling from Mercury Checking

### IMPC Expenses
- Chase credit card transactions appear in QBO bank feed
- Two Chase CCs: B. Lewis (6311) and V. Quesnelle (3774)
- Expenses categorized directly in QBO

## Tax Report Outputs

Reports are generated to `output/tax-2025/` for accountant delivery:

```
output/tax-2025/
  Cameron_Healthcare_Partners/
    CHP_Comparative_Balance_Sheet_2025v2024.csv
    CHP_Comparative_Income_Statement_2025v2024.csv
    CHP_Trial_Balance_2025.csv
    CHP_General_Ledger_2025.csv
    CHP_Payroll_Reconciliation_2025.csv
    CHP_Payroll_By_State_2025.csv
  Integrative_Medicine_Psychiatry/
    IMPC_Comparative_Balance_Sheet_2025v2024.csv
    IMPC_Comparative_Income_Statement_2025v2024.csv
    IMPC_Trial_Balance_2025.csv
    IMPC_General_Ledger_2025.csv
    IMPC_Payroll_Reconciliation_Justworks_2025.csv
    IMPC_Payroll_Reconciliation_Rippling_2025.csv
    IMPC_Payroll_By_State_2025.csv
```

### How to Regenerate CHP Reports
1. Use ERPNext MCP `run_report` tool with `company: "Cameron Healthcare Partners"`, date range 2025-01-01 to 2025-12-31
2. Reports: `Trial Balance` (needs `fiscal_year: "2025"`), `Balance Sheet`, `Profit and Loss Statement` (use `periodicity: "Yearly"`)
3. `General Ledger` returns `prepared_report: true` if too large — pull via direct GL Entry API instead

### How to Regenerate IMPC Reports
1. Use QuickBooks MCP tools: `qb_trial_balance`, `qb_comparative_balance_sheet`, `qb_comparative_income_statement`
2. For General Ledger: `qb_general_ledger` returns raw QBO JSON — convert to CSV with Python (see `IMPC_General_Ledger_2025_raw.json`)
3. All QBO reports use `accounting_method: "Accrual"`

## BigQuery Data Warehouse

Project: `integrative-mind-dw` (GCP)

Additional data loaders in `../claude_mcp/src/`:
- `load_rippling_to_bq.py` — Rippling payroll → `rippling_payroll.journal`
- `load_justworks_to_bq.py` — Justworks invoices → `justworks_payroll.invoice_details`
- `load_valant_to_bq.py` — Valant EHR clinical data → BigQuery
- `load_waystar_to_bq.py` — Waystar medical billing → BigQuery
- `load_erpnext_to_bq.py` — ERPNext accounting data → BigQuery

All use GCP service account authentication.

## Playwright MCP (Browser Automation)

Configured in `.mcp.json` using `@playwright/mcp@latest --browser chromium`. Launches headed Chromium via WSLg.

**Important:**
- Do NOT use the `playwright` npm library directly — Cloudflare Turnstile blocks Playwright's bundled Chromium
- Use the Playwright MCP tools instead — user logs in interactively (handles 2FA), then Claude drives navigation
- Do NOT pass `--headed` (default since 0.0.68); MUST pass `--browser chromium`
- Chromium at `~/.cache/ms-playwright/chromium-1208/`
- WSLg env: `DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0`, `XDG_RUNTIME_DIR=/run/user/1000/`

### Justworks (IMPC) — Playwright Flows

Justworks is a PEO — files payroll taxes under Justworks' EIN, not IMPC's.

**Invoice Details Download:**
1. Navigate to `https://secure.justworks.com` → user logs in (email + password + 2FA)
2. Navigate to `https://secure.justworks.com/reports/request?report_type=invoice_details&year={YEAR}`
3. Wait for "Report successfully generated", click "Download Report"
4. CSV downloads to `.playwright-mcp/`

**Tax Documents (941s, W-2s):**
1. Navigate to `https://payroll.justworks.com/company/company_01fn4w79xrzy2hm9z92n2dfdsr/documents/tax_report` (or `/documents/w2`)
2. PDFs are embedded in iframes — clicking "Download" navigates away instead of downloading
3. Workaround: click the document name link to open the view page, then use `browser_evaluate` to extract the iframe's S3 signed URL:
   ```js
   () => { const iframe = document.querySelector('iframe'); return iframe ? iframe.src : 'no iframe'; }
   ```
4. Download the S3 URL via `curl` (strip the `#fragment`), naming the file appropriately
5. Signed URLs expire in 300 seconds — download promptly after extracting

**Save to:** `output/tax-{YEAR}/Integrative_Medicine_Psychiatry/payroll/`

### Rippling (CHP + IMPC) — Playwright Flows

Rippling is used for both CHP and IMPC payroll. IMPC employees on Rippling are paid directly by IMPC (Rippling is the payroll processor, NOT a PEO — payroll taxes are filed under IMPC's EIN). This is separate from Justworks (PEO) above.

IMPC has multiple pay schedules on Rippling:
- Semi-monthly pay schedule (Bliss)
- Hourly Semi-Monthly Schedule
- Integrative Mind - Hourly Bi-weekly

CHP has one pay schedule:
- Semi-monthly pay schedule

**Tax Documents (W-2s, 940, 941 packages):**
1. Navigate to `https://app.rippling.com` → user logs in (email + password + 2FA)
2. Accessing Payroll requires step-up identity verification (text/call to phone)
3. Navigate to `https://app.rippling.com/payroll/dashboard` → Documents tab → Previous Filings (Documents)
4. Click each download button — files download directly to `.playwright-mcp/`
5. Available documents for a given year: W-2s, Year End Package, Form 940, Combined Returns Packages (per quarter), IRS Quarterly Packages
6. Documents are per-entity — filter by entity if needed

**Accounting Exports (CHP only — for ERPNext import via `convert_rippling.py`):**
IMPC Rippling payroll auto-syncs to QBO via integration, so only CHP pay runs need manual CSV export.
1. Same Rippling session (already authenticated)
2. Navigate to Payroll Overview → Paid tab (`https://app.rippling.com/payroll/dashboard/overview?section=paid`)
3. Click into a specific completed CHP pay run (e.g., "Mar 1st - Mar 15th: Cameron Healthcare Partners LLC")
4. On the pay run status page, click "More Options" (⋮ button next to "Preview and Reports")
5. Select "Email/Download general ledger CSV Journal"
6. In the dialog, check "Download the CSV journal" and click Continue
7. CSV downloads to `.playwright-mcp/` — rename and save to `../FinancialIntelligencer/input/` with naming convention: `YYYY.MM.DD_Cameron Healthcare Partners LLC accounting export.csv`
8. Run `../FinancialIntelligencer/convert_rippling.py` to import into ERPNext

**Save tax docs to:**
- CHP: `output/tax-{YEAR}/Cameron_Healthcare_Partners/payroll/`
- IMPC: `output/tax-{YEAR}/Integrative_Medicine_Psychiatry/payroll/`

## Report Distribution (rclone → Google Shared Drives)

`sync-reports.sh` uploads tax report CSVs to Google Shared Drives for accountant access.

### Remotes (configured in Windows rclone at `/mnt/c/Users/soonh/scoop/shims/rclone.exe`)
- `cp-gdrive` — Cameron Partners holdco shared drive (Cameron One reports)
- `chp-gdrive` — CHP shared drive (CHP + IMPC reports)

### Mapping
| Source | Destination |
|--------|-------------|
| `output/tax-2025/Cameron_One_Inc/` | `cp-gdrive:Tax/2025 Taxes/Reports/` |
| `output/tax-2025/Cameron_Healthcare_Partners/` | `chp-gdrive:Tax/2025 Taxes/Reports/` |
| `output/tax-2025/Integrative_Medicine_Psychiatry/` | `chp-gdrive:0 - Integrative Mind PC/Tax/2025/Reports/` |

### Usage
```bash
./sync-reports.sh --dry-run   # Preview what would be uploaded
./sync-reports.sh             # Upload reports
```

JSON files are excluded from sync (intermediate data, not for accountants).
