import axios, { AxiosInstance } from "axios";
import fs from "fs";
import path from "path";

const TOKEN_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || ".",
  ".quickbooks-tokens.json"
);

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  realm_id: string;
}

interface QBReportOptions {
  start_date?: string;
  end_date?: string;
  accounting_method?: "Cash" | "Accrual";
  summarize_column_by?: string;
}

export class QuickBooksClient {
  private clientId: string;
  private clientSecret: string;
  private tokens: TokenData | null = null;
  private api: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.clientId = process.env.QB_CLIENT_ID || "";
    this.clientSecret = process.env.QB_CLIENT_SECRET || "";

    const sandbox = process.env.QB_SANDBOX === "true";
    this.baseUrl = sandbox
      ? "https://sandbox-quickbooks.api.intuit.com"
      : "https://quickbooks.api.intuit.com";

    this.api = axios.create();
    this.loadTokens();
  }

  private loadTokens(): void {
    try {
      if (fs.existsSync(TOKEN_FILE)) {
        const data = fs.readFileSync(TOKEN_FILE, "utf-8");
        this.tokens = JSON.parse(data);
      }
    } catch {
      console.error("Failed to load tokens from file");
    }
  }

  private saveTokens(): void {
    if (this.tokens) {
      fs.writeFileSync(TOKEN_FILE, JSON.stringify(this.tokens, null, 2));
    }
  }

  isAuthenticated(): boolean {
    return this.tokens !== null && !!this.tokens.access_token;
  }

  getRealmId(): string {
    return this.tokens?.realm_id || "";
  }

  async refreshAccessToken(): Promise<void> {
    if (!this.tokens?.refresh_token) {
      throw new Error(
        "No refresh token available. Run the OAuth setup script first: npm run qb:auth"
      );
    }

    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.tokens.refresh_token,
    });

    const auth = Buffer.from(
      `${this.clientId}:${this.clientSecret}`
    ).toString("base64");

    const response = await axios.post(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      params.toString(),
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    this.tokens = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_at: Date.now() + response.data.expires_in * 1000,
      realm_id: this.tokens.realm_id,
    };

    this.saveTokens();
  }

  private async ensureValidToken(): Promise<void> {
    if (!this.tokens) {
      throw new Error(
        "Not authenticated. Run the OAuth setup script first: npm run qb:auth"
      );
    }

    // Refresh if token expires within 5 minutes
    if (Date.now() > this.tokens.expires_at - 5 * 60 * 1000) {
      await this.refreshAccessToken();
    }
  }

  private async request<T>(
    method: "get" | "post",
    endpoint: string,
    params?: Record<string, string>,
    data?: any
  ): Promise<T> {
    await this.ensureValidToken();

    const url = `${this.baseUrl}/v3/company/${this.tokens!.realm_id}${endpoint}`;

    const response = await this.api.request({
      method,
      url,
      params: { ...params, minorversion: "75" },
      headers: {
        Authorization: `Bearer ${this.tokens!.access_token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      ...(data ? { data } : {}),
    });

    return response.data;
  }

  // --- Report endpoints ---

  async getBalanceSheet(options: QBReportOptions = {}): Promise<any> {
    const params: Record<string, string> = {};
    if (options.start_date) params.start_date = options.start_date;
    if (options.end_date) params.end_date = options.end_date;
    if (options.accounting_method)
      params.accounting_method = options.accounting_method;
    if (options.summarize_column_by)
      params.summarize_column_by = options.summarize_column_by;

    return this.request("get", "/reports/BalanceSheet", params);
  }

  async getTrialBalance(options: QBReportOptions = {}): Promise<any> {
    const params: Record<string, string> = {};
    if (options.start_date) params.start_date = options.start_date;
    if (options.end_date) params.end_date = options.end_date;
    if (options.accounting_method)
      params.accounting_method = options.accounting_method;

    return this.request("get", "/reports/TrialBalance", params);
  }

  async getGeneralLedger(options: QBReportOptions = {}): Promise<any> {
    const params: Record<string, string> = {};
    if (options.start_date) params.start_date = options.start_date;
    if (options.end_date) params.end_date = options.end_date;
    if (options.accounting_method)
      params.accounting_method = options.accounting_method;
    if (options.summarize_column_by)
      params.summarize_column_by = options.summarize_column_by;

    return this.request("get", "/reports/GeneralLedger", params);
  }

  async getProfitAndLoss(options: QBReportOptions = {}): Promise<any> {
    const params: Record<string, string> = {};
    if (options.start_date) params.start_date = options.start_date;
    if (options.end_date) params.end_date = options.end_date;
    if (options.accounting_method)
      params.accounting_method = options.accounting_method;
    if (options.summarize_column_by)
      params.summarize_column_by = options.summarize_column_by;

    return this.request("get", "/reports/ProfitAndLoss", params);
  }

  async getBalanceSheetComparative(
    currentEnd: string,
    priorEnd: string,
    accountingMethod?: "Cash" | "Accrual"
  ): Promise<{ current: any; prior: any }> {
    const params: Record<string, string> = {};
    if (accountingMethod) params.accounting_method = accountingMethod;

    // Current period
    params.start_date = currentEnd.slice(0, 4) + "-01-01";
    params.end_date = currentEnd;
    const current = await this.request("get", "/reports/BalanceSheet", params);

    // Prior period
    params.start_date = priorEnd.slice(0, 4) + "-01-01";
    params.end_date = priorEnd;
    const prior = await this.request("get", "/reports/BalanceSheet", params);

    return { current, prior };
  }

  async getProfitAndLossComparative(
    currentStart: string,
    currentEnd: string,
    priorStart: string,
    priorEnd: string,
    accountingMethod?: "Cash" | "Accrual"
  ): Promise<{ current: any; prior: any }> {
    const params: Record<string, string> = {};
    if (accountingMethod) params.accounting_method = accountingMethod;

    params.start_date = currentStart;
    params.end_date = currentEnd;
    const current = await this.request(
      "get",
      "/reports/ProfitAndLoss",
      params
    );

    params.start_date = priorStart;
    params.end_date = priorEnd;
    const prior = await this.request("get", "/reports/ProfitAndLoss", params);

    return { current, prior };
  }

  // --- Entity endpoints ---

  async query<T>(queryStr: string): Promise<T> {
    return this.request("get", "/query", { query: queryStr });
  }

  async getCompanyInfo(): Promise<any> {
    const realmId = this.getRealmId();
    return this.request("get", `/companyinfo/${realmId}`);
  }

  async getAccounts(): Promise<any> {
    return this.query(
      "SELECT * FROM Account WHERE Active = true MAXRESULTS 1000"
    );
  }

  async getVendors(): Promise<any> {
    return this.query(
      "SELECT * FROM Vendor WHERE Active = true MAXRESULTS 1000"
    );
  }

  async getCustomers(): Promise<any> {
    return this.query(
      "SELECT * FROM Customer WHERE Active = true MAXRESULTS 1000"
    );
  }

  async getEmployees(): Promise<any> {
    return this.query(
      "SELECT * FROM Employee WHERE Active = true MAXRESULTS 1000"
    );
  }

  // --- Write endpoints ---

  async createBill(bill: {
    vendor_id: string;
    txn_date: string;
    due_date?: string;
    lines: Array<{
      account_id: string;
      amount: number;
      description?: string;
    }>;
    private_note?: string;
  }): Promise<any> {
    const body: any = {
      VendorRef: { value: bill.vendor_id },
      TxnDate: bill.txn_date,
      Line: bill.lines.map((line) => ({
        Amount: line.amount,
        DetailType: "AccountBasedExpenseLineDetail",
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: line.account_id },
        },
        Description: line.description || "",
      })),
    };
    if (bill.due_date) body.DueDate = bill.due_date;
    if (bill.private_note) body.PrivateNote = bill.private_note;

    return this.request("post", "/bill", undefined, body);
  }

  async createJournalEntry(entry: {
    txn_date: string;
    lines: Array<{
      account_id: string;
      posting_type: "Debit" | "Credit";
      amount: number;
      description?: string;
    }>;
    private_note?: string;
  }): Promise<any> {
    const body: any = {
      TxnDate: entry.txn_date,
      Line: entry.lines.map((line) => ({
        Amount: line.amount,
        DetailType: "JournalEntryLineDetail",
        JournalEntryLineDetail: {
          PostingType: line.posting_type,
          AccountRef: { value: line.account_id },
        },
        Description: line.description || "",
      })),
    };
    if (entry.private_note) body.PrivateNote = entry.private_note;

    return this.request("post", "/journalentry", undefined, body);
  }

  async updateEntity(entityType: string, body: any): Promise<any> {
    const endpoint = `/${entityType.toLowerCase()}`;
    return this.request("post", endpoint, undefined, body);
  }
}
