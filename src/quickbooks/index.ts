#!/usr/bin/env node

import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { QuickBooksClient } from "./client.js";

const qb = new QuickBooksClient();

const server = new Server(
  { name: "quickbooks-server", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// --- Tool definitions ---

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "qb_company_info",
      description: "Get QuickBooks company information",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "qb_balance_sheet",
      description:
        "Get Balance Sheet report. Optionally specify date range and accounting method.",
      inputSchema: {
        type: "object",
        properties: {
          start_date: {
            type: "string",
            description: "Start date (YYYY-MM-DD). Defaults to start of current fiscal year.",
          },
          end_date: {
            type: "string",
            description: "End date (YYYY-MM-DD). Defaults to today.",
          },
          accounting_method: {
            type: "string",
            enum: ["Cash", "Accrual"],
            description: "Accounting method. Defaults to company preference.",
          },
        },
      },
    },
    {
      name: "qb_trial_balance",
      description:
        "Get Trial Balance report for a specified period.",
      inputSchema: {
        type: "object",
        properties: {
          start_date: {
            type: "string",
            description: "Start date (YYYY-MM-DD)",
          },
          end_date: {
            type: "string",
            description: "End date (YYYY-MM-DD)",
          },
          accounting_method: {
            type: "string",
            enum: ["Cash", "Accrual"],
          },
        },
      },
    },
    {
      name: "qb_general_ledger",
      description:
        "Get General Ledger report showing all transactions for a period.",
      inputSchema: {
        type: "object",
        properties: {
          start_date: {
            type: "string",
            description: "Start date (YYYY-MM-DD)",
          },
          end_date: {
            type: "string",
            description: "End date (YYYY-MM-DD)",
          },
          accounting_method: {
            type: "string",
            enum: ["Cash", "Accrual"],
          },
        },
      },
    },
    {
      name: "qb_profit_and_loss",
      description:
        "Get Profit & Loss (Income Statement) report for a specified period.",
      inputSchema: {
        type: "object",
        properties: {
          start_date: {
            type: "string",
            description: "Start date (YYYY-MM-DD)",
          },
          end_date: {
            type: "string",
            description: "End date (YYYY-MM-DD)",
          },
          accounting_method: {
            type: "string",
            enum: ["Cash", "Accrual"],
          },
          summarize_column_by: {
            type: "string",
            enum: ["Total", "Month", "Quarter", "Year"],
            description: "How to summarize columns. Defaults to Total.",
          },
        },
      },
    },
    {
      name: "qb_comparative_balance_sheet",
      description:
        "Get comparative Balance Sheet for two periods (e.g., 2025 vs 2024) showing dollar changes.",
      inputSchema: {
        type: "object",
        properties: {
          current_end_date: {
            type: "string",
            description: "End date for current period (YYYY-MM-DD), e.g. 2025-12-31",
          },
          prior_end_date: {
            type: "string",
            description: "End date for prior period (YYYY-MM-DD), e.g. 2024-12-31",
          },
          accounting_method: {
            type: "string",
            enum: ["Cash", "Accrual"],
          },
        },
        required: ["current_end_date", "prior_end_date"],
      },
    },
    {
      name: "qb_comparative_income_statement",
      description:
        "Get comparative Income Statement (P&L) for two periods showing dollar changes.",
      inputSchema: {
        type: "object",
        properties: {
          current_start_date: {
            type: "string",
            description: "Start date for current period (YYYY-MM-DD), e.g. 2025-01-01",
          },
          current_end_date: {
            type: "string",
            description: "End date for current period (YYYY-MM-DD), e.g. 2025-12-31",
          },
          prior_start_date: {
            type: "string",
            description: "Start date for prior period (YYYY-MM-DD), e.g. 2024-01-01",
          },
          prior_end_date: {
            type: "string",
            description: "End date for prior period (YYYY-MM-DD), e.g. 2024-12-31",
          },
          accounting_method: {
            type: "string",
            enum: ["Cash", "Accrual"],
          },
        },
        required: [
          "current_start_date",
          "current_end_date",
          "prior_start_date",
          "prior_end_date",
        ],
      },
    },
    {
      name: "qb_accounts",
      description: "List all active accounts in the Chart of Accounts.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "qb_query",
      description:
        "Run a custom QuickBooks query (SQL-like syntax). Example: SELECT * FROM Invoice WHERE TotalAmt > '1000' MAXRESULTS 50",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "QuickBooks query string",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "qb_vendors",
      description: "List all active vendors.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "qb_customers",
      description: "List all active customers.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "qb_employees",
      description: "List all active employees.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "qb_create_bill",
      description:
        "Create a Bill (vendor invoice) in QuickBooks. Requires vendor ID, account ID(s), amounts, and date. Use qb_query to look up vendor and account IDs first.",
      inputSchema: {
        type: "object",
        properties: {
          vendor_id: {
            type: "string",
            description: "Vendor ID (numeric). Use qb_vendors or qb_query to find it.",
          },
          txn_date: {
            type: "string",
            description: "Transaction date (YYYY-MM-DD)",
          },
          due_date: {
            type: "string",
            description: "Due date (YYYY-MM-DD). Optional.",
          },
          lines: {
            type: "array",
            description: "Bill line items",
            items: {
              type: "object",
              properties: {
                account_id: {
                  type: "string",
                  description: "Expense account ID (numeric). Use qb_accounts to find it.",
                },
                amount: { type: "number", description: "Line amount" },
                description: { type: "string", description: "Line description" },
              },
              required: ["account_id", "amount"],
            },
          },
          private_note: {
            type: "string",
            description: "Internal memo/note on the bill",
          },
        },
        required: ["vendor_id", "txn_date", "lines"],
      },
    },
    {
      name: "qb_create_journal_entry",
      description:
        "Create a Journal Entry in QuickBooks. Each line must specify account ID, posting type (Debit/Credit), and amount. Debits must equal credits.",
      inputSchema: {
        type: "object",
        properties: {
          txn_date: {
            type: "string",
            description: "Transaction date (YYYY-MM-DD)",
          },
          lines: {
            type: "array",
            description: "Journal entry lines. Total debits must equal total credits.",
            items: {
              type: "object",
              properties: {
                account_id: {
                  type: "string",
                  description: "Account ID (numeric)",
                },
                posting_type: {
                  type: "string",
                  enum: ["Debit", "Credit"],
                },
                amount: { type: "number" },
                description: { type: "string" },
              },
              required: ["account_id", "posting_type", "amount"],
            },
          },
          private_note: { type: "string", description: "Internal memo" },
        },
        required: ["txn_date", "lines"],
      },
    },
    {
      name: "qb_update_entity",
      description:
        "Update an existing QuickBooks entity (Purchase, Deposit, Bill, JournalEntry, etc). Send the full or sparse object with Id and SyncToken. Use qb_query to fetch the current object first.",
      inputSchema: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            description: "Entity type (e.g., 'Purchase', 'Deposit', 'Bill', 'JournalEntry')",
          },
          body: {
            type: "object",
            description: "Full entity body including Id, SyncToken, and updated fields. Use sparse:true for partial updates.",
            additionalProperties: true,
          },
        },
        required: ["entity_type", "body"],
      },
    },
  ],
}));

// --- Tool handlers ---

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!qb.isAuthenticated()) {
    return {
      content: [
        {
          type: "text",
          text: "Not authenticated. Run `npm run qb:auth` to connect your QuickBooks account.",
        },
      ],
      isError: true,
    };
  }

  try {
    switch (name) {
      case "qb_company_info": {
        const info = await qb.getCompanyInfo();
        return {
          content: [
            { type: "text", text: JSON.stringify(info, null, 2) },
          ],
        };
      }

      case "qb_balance_sheet": {
        const report = await qb.getBalanceSheet({
          start_date: args?.start_date as string,
          end_date: args?.end_date as string,
          accounting_method: args?.accounting_method as "Cash" | "Accrual",
        });
        return {
          content: [
            { type: "text", text: JSON.stringify(report, null, 2) },
          ],
        };
      }

      case "qb_trial_balance": {
        const report = await qb.getTrialBalance({
          start_date: args?.start_date as string,
          end_date: args?.end_date as string,
          accounting_method: args?.accounting_method as "Cash" | "Accrual",
        });
        return {
          content: [
            { type: "text", text: JSON.stringify(report, null, 2) },
          ],
        };
      }

      case "qb_general_ledger": {
        const report = await qb.getGeneralLedger({
          start_date: args?.start_date as string,
          end_date: args?.end_date as string,
          accounting_method: args?.accounting_method as "Cash" | "Accrual",
        });
        return {
          content: [
            { type: "text", text: JSON.stringify(report, null, 2) },
          ],
        };
      }

      case "qb_profit_and_loss": {
        const report = await qb.getProfitAndLoss({
          start_date: args?.start_date as string,
          end_date: args?.end_date as string,
          accounting_method: args?.accounting_method as "Cash" | "Accrual",
          summarize_column_by: args?.summarize_column_by as string,
        });
        return {
          content: [
            { type: "text", text: JSON.stringify(report, null, 2) },
          ],
        };
      }

      case "qb_comparative_balance_sheet": {
        const { current, prior } = await qb.getBalanceSheetComparative(
          args!.current_end_date as string,
          args!.prior_end_date as string,
          args?.accounting_method as "Cash" | "Accrual"
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  current_period: current,
                  prior_period: prior,
                  note: "Compare line items between periods to compute dollar changes.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "qb_comparative_income_statement": {
        const { current, prior } = await qb.getProfitAndLossComparative(
          args!.current_start_date as string,
          args!.current_end_date as string,
          args!.prior_start_date as string,
          args!.prior_end_date as string,
          args?.accounting_method as "Cash" | "Accrual"
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  current_period: current,
                  prior_period: prior,
                  note: "Compare line items between periods to compute dollar changes.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "qb_accounts": {
        const accounts = await qb.getAccounts();
        return {
          content: [
            { type: "text", text: JSON.stringify(accounts, null, 2) },
          ],
        };
      }

      case "qb_query": {
        const result = await qb.query(args!.query as string);
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      }

      case "qb_vendors": {
        const vendors = await qb.getVendors();
        return {
          content: [
            { type: "text", text: JSON.stringify(vendors, null, 2) },
          ],
        };
      }

      case "qb_customers": {
        const customers = await qb.getCustomers();
        return {
          content: [
            { type: "text", text: JSON.stringify(customers, null, 2) },
          ],
        };
      }

      case "qb_employees": {
        const employees = await qb.getEmployees();
        return {
          content: [
            { type: "text", text: JSON.stringify(employees, null, 2) },
          ],
        };
      }

      case "qb_create_bill": {
        const result = await qb.createBill({
          vendor_id: args!.vendor_id as string,
          txn_date: args!.txn_date as string,
          due_date: args?.due_date as string | undefined,
          lines: args!.lines as Array<{
            account_id: string;
            amount: number;
            description?: string;
          }>,
          private_note: args?.private_note as string | undefined,
        });
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      }

      case "qb_update_entity": {
        const result = await qb.updateEntity(
          args!.entity_type as string,
          args!.body as any
        );
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      }

      case "qb_create_journal_entry": {
        const result = await qb.createJournalEntry({
          txn_date: args!.txn_date as string,
          lines: args!.lines as Array<{
            account_id: string;
            posting_type: "Debit" | "Credit";
            amount: number;
            description?: string;
          }>,
          private_note: args?.private_note as string | undefined,
        });
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err: any) {
    const errorMsg =
      err.response?.data?.Fault?.Error?.[0]?.Detail ||
      err.response?.data?.Fault?.Error?.[0]?.Message ||
      err.message ||
      "Unknown error";

    return {
      content: [{ type: "text", text: `QuickBooks error: ${errorMsg}` }],
      isError: true,
    };
  }
});

// --- Start server ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("QuickBooks MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
