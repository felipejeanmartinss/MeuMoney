export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type FinancialContext = "personal" | "professional";
export type AccountType =
  | "checking"
  | "savings"
  | "investment"
  | "credit_card"
  | "cash"
  | "other";
export type CategoryKind = "income" | "expense";
export type SupportedCurrency = "BRL" | "USD" | "EUR";
export type TransactionType = "income" | "expense";
export type TransactionStatus = "pending" | "completed";
export type TransferDirection = "outflow" | "inflow";
export type CreditCardBrand =
  | "visa"
  | "mastercard"
  | "elo"
  | "amex"
  | "hipercard"
  | "other";
export type CreditCardPurchaseStatus = "active" | "cancelled";
export type CreditCardInstallmentStatus =
  | "pending"
  | "invoiced"
  | "paid"
  | "cancelled";
export type CreditCardInvoiceStatus = "open" | "closed" | "paid" | "overdue";
export type TransactionOriginType =
  | "manual"
  | "credit_card_invoice_payment"
  | "system";
export type RecurrenceFrequency = "weekly" | "monthly" | "yearly";
export type RecurringTransactionState = "active" | "suspended" | "ended";
export type NetWorthItemKind = "asset" | "liability";
export type NetWorthItemType =
  | "real_estate"
  | "vehicle"
  | "other_asset"
  | "financing"
  | "loan"
  | "other_debt";
export type InvestmentClass =
  | "fixed_income"
  | "stock"
  | "fund"
  | "etf"
  | "real_estate_fund"
  | "pension"
  | "crypto";
export type InvestmentCashFlowType =
  | "contribution"
  | "redemption"
  | "income";
export type ImportFileType = "csv" | "ofx" | "pdf";
export type ImportJobStatus =
  | "review"
  | "ready"
  | "completed"
  | "cancelled"
  | "failed";
export type ImportRowStatus =
  | "needs_review"
  | "valid"
  | "duplicate"
  | "ignored"
  | "imported"
  | "error";

export type Profile = {
  id: string;
  full_name: string;
  preferred_currency: SupportedCurrency;
  created_at: string;
  updated_at: string;
};

export type Account = {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  context: FinancialContext;
  currency: SupportedCurrency;
  opening_balance_minor: number;
  opening_balance_date: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Category = {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  kind: CategoryKind;
  context: FinancialContext;
  is_system: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  transaction_type: TransactionType;
  description: string;
  amount_minor: number;
  transaction_date: string;
  status: TransactionStatus;
  notes: string | null;
  is_active: boolean;
  origin_type: TransactionOriginType;
  origin_id: string | null;
  credit_card_invoice_id: string | null;
  recurring_transaction_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RecurringTransaction = {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string;
  transaction_type: TransactionType;
  description: string;
  amount_minor: number;
  frequency: RecurrenceFrequency;
  start_date: string;
  end_date: string | null;
  next_occurrence: string;
  notes: string | null;
  is_active: boolean;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreditCard = {
  id: string;
  user_id: string;
  name: string;
  issuer: string;
  brand: CreditCardBrand;
  last_four_digits: string;
  credit_limit: number;
  closing_day: number;
  due_day: number;
  currency: SupportedCurrency;
  linked_account_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CreditCardPurchase = {
  id: string;
  user_id: string;
  credit_card_id: string;
  category_id: string;
  description: string;
  total_amount: number;
  purchase_date: string;
  installment_count: number;
  status: CreditCardPurchaseStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CreditCardInvoice = {
  id: string;
  user_id: string;
  credit_card_id: string;
  reference_month: string;
  closing_date: string;
  due_date: string;
  status: CreditCardInvoiceStatus;
  total_amount: number;
  paid_amount: number;
  closed_at: string | null;
  paid_at: string | null;
  payment_account_id: string | null;
  payment_transaction_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CreditCardInstallment = {
  id: string;
  user_id: string;
  purchase_id: string;
  credit_card_id: string;
  invoice_id: string;
  installment_number: number;
  installment_count: number;
  amount: number;
  competence_date: string;
  status: CreditCardInstallmentStatus;
  created_at: string;
  updated_at: string;
};

export type CreditCardSummary = CreditCard & {
  used_limit: number;
  available_limit: number;
};

export type Transfer = {
  id: string;
  user_id: string;
  source_account_id: string;
  destination_account_id: string;
  amount_minor: number;
  currency: SupportedCurrency;
  transaction_date: string;
  status: TransactionStatus;
  description: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type TransferEntry = {
  id: string;
  transfer_id: string;
  user_id: string;
  account_id: string;
  direction: TransferDirection;
  amount_minor: number;
  currency: SupportedCurrency;
  transaction_date: string;
  status: TransactionStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AccountBalance = Account & {
  current_balance_minor: number;
};

export type MonthlyBudget = {
  id: string;
  user_id: string;
  category_id: string;
  reference_month: string;
  currency: SupportedCurrency;
  planned_amount_minor: number;
  created_at: string;
  updated_at: string;
};

export type MonthlyConsumption = {
  user_id: string;
  category_id: string;
  context: FinancialContext;
  currency: SupportedCurrency;
  reference_month: string;
  realized_amount_minor: number;
};

export type MonthlyBudgetProgress = {
  budget_id: string | null;
  user_id: string;
  category_id: string;
  category_name: string;
  context: FinancialContext;
  currency: SupportedCurrency;
  reference_month: string;
  planned_amount_minor: number;
  realized_amount_minor: number;
  available_amount_minor: number;
  percentage_consumed: number | null;
};

export type FinancialDashboardMonthlySummary = {
  user_id: string;
  reference_month: string;
  currency: SupportedCurrency;
  income_amount_minor: number;
  expense_amount_minor: number;
  result_amount_minor: number;
  planned_amount_minor: number;
  budget_percentage_consumed: number | null;
};

export type FinancialDashboardExpenseCategory = {
  user_id: string;
  reference_month: string;
  currency: SupportedCurrency;
  category_id: string;
  category_name: string;
  context: FinancialContext;
  expense_amount_minor: number;
};

export type FinancialDashboardUpcomingRecurrence = {
  id: string;
  user_id: string;
  currency: SupportedCurrency;
  account_name: string;
  category_name: string;
  context: FinancialContext;
  transaction_type: TransactionType;
  description: string;
  amount_minor: number;
  frequency: RecurrenceFrequency;
  next_occurrence: string;
};

export type FinancialDashboardInvoice = {
  id: string;
  user_id: string;
  credit_card_id: string;
  credit_card_name: string;
  currency: SupportedCurrency;
  reference_month: string;
  due_date: string;
  status: CreditCardInvoiceStatus;
  effective_status: CreditCardInvoiceStatus;
  total_amount_minor: number;
  outstanding_amount_minor: number;
};

export type NetWorthItem = {
  id: string;
  user_id: string;
  kind: NetWorthItemKind;
  item_type: NetWorthItemType;
  name: string;
  currency: SupportedCurrency;
  current_value_minor: number;
  valuation_date: string;
  context: FinancialContext;
  notes: string | null;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NetWorthValuation = {
  id: string;
  item_id: string;
  user_id: string;
  currency: SupportedCurrency;
  value_minor: number;
  valuation_date: string;
  created_at: string;
  updated_at: string;
};

export type NetWorthSummary = {
  user_id: string;
  currency: SupportedCurrency;
  assets_minor: number;
  manual_assets_minor: number;
  investments_minor: number;
  liabilities_minor: number;
  net_worth_minor: number;
};

export type InvestmentPosition = {
  id: string;
  user_id: string;
  institution: string;
  investment_class: InvestmentClass;
  asset_name: string;
  currency: SupportedCurrency;
  quantity: string;
  accumulated_cost_minor: number;
  current_value_minor: number;
  position_date: string;
  context: FinancialContext;
  history_is_complete: boolean;
  notes: string | null;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InvestmentPositionSnapshot = {
  id: string;
  position_id: string;
  user_id: string;
  currency: SupportedCurrency;
  quantity: string;
  accumulated_cost_minor: number;
  current_value_minor: number;
  position_date: string;
  created_at: string;
  updated_at: string;
};

export type InvestmentCashFlow = {
  id: string;
  position_id: string;
  user_id: string;
  cash_flow_type: InvestmentCashFlowType;
  amount_minor: number;
  quantity: string | null;
  cash_flow_date: string;
  notes: string | null;
  created_at: string;
};

export type InvestmentPositionSummary = InvestmentPosition & {
  contributions_minor: number;
  redemptions_minor: number;
  income_minor: number;
  unrealized_appreciation_minor: number;
  total_result_minor: number | null;
};

export type ImportJob = {
  id: string;
  user_id: string;
  account_id: string | null;
  file_name: string;
  file_type: ImportFileType;
  file_sha256: string;
  csv_config: Json | null;
  source_adapter_id: string | null;
  source_document_type: string | null;
  status: ImportJobStatus;
  source_row_count: number;
  valid_row_count: number;
  duplicate_row_count: number;
  imported_row_count: number;
  original_file_discarded_at: string;
  expires_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ImportStagingRow = {
  id: string;
  job_id: string;
  user_id: string;
  source_row_number: number;
  source_external_id: string | null;
  source_date_text: string;
  source_amount_text: string;
  source_description_original: string | null;
  source_pages: number[];
  confidence: number | null;
  transaction_date: string | null;
  description: string | null;
  normalized_description: string | null;
  signed_amount_minor: number | null;
  transaction_type: TransactionType | null;
  amount_minor: number | null;
  account_id: string | null;
  category_id: string | null;
  signature: string | null;
  status: ImportRowStatus;
  validation_code:
    | "invalid_date"
    | "invalid_amount"
    | "missing_description"
    | "unsupported_record"
    | null;
  duplicate_transaction_id: string | null;
  is_selected: boolean;
  created_at: string;
  updated_at: string;
};

export type ImportedTransactionSignature = {
  id: string;
  user_id: string;
  account_id: string;
  transaction_id: string;
  source_job_id: string | null;
  signature: string;
  created_at: string;
};

export type CriticalOperationEventType =
  | "data_exported"
  | "backup_restored"
  | "account_deletion_requested"
  | "account_deletion_failed"
  | "import_confirmed"
  | "import_cancelled"
  | "import_retention_applied";

export type CriticalOperationEvent = {
  id: string;
  user_id: string;
  event_type: CriticalOperationEventType;
  outcome: "success" | "failure";
  resource_type: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          full_name?: string;
          preferred_currency?: SupportedCurrency;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string;
          preferred_currency?: SupportedCurrency;
          updated_at?: string;
        };
        Relationships: [];
      };
      accounts: {
        Row: Account;
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          type: AccountType;
          context: FinancialContext;
          currency?: SupportedCurrency;
          opening_balance_minor?: number;
          opening_balance_date?: string;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Account, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      categories: {
        Row: Category;
        Insert: {
          id?: string;
          user_id: string;
          parent_id?: string | null;
          name: string;
          kind: CategoryKind;
          context: FinancialContext;
          is_system?: boolean;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Omit<Category, "id" | "user_id" | "is_system" | "created_at">
        >;
        Relationships: [];
      };
      transactions: {
        Row: Transaction;
        Insert: {
          id?: string;
          user_id: string;
          account_id: string;
          category_id: string;
          transaction_type: TransactionType;
          description: string;
          amount_minor: number;
          transaction_date: string;
          status?: TransactionStatus;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Omit<
            Transaction,
            | "id"
            | "user_id"
            | "created_at"
            | "origin_type"
            | "origin_id"
            | "credit_card_invoice_id"
            | "recurring_transaction_id"
          >
        >;
        Relationships: [];
      };
      recurring_transactions: {
        Row: RecurringTransaction;
        Insert: {
          id?: string;
          user_id: string;
          account_id: string;
          category_id: string;
          transaction_type: TransactionType;
          description: string;
          amount_minor: number;
          frequency: RecurrenceFrequency;
          start_date: string;
          end_date?: string | null;
          next_occurrence: string;
          notes?: string | null;
          is_active?: boolean;
          ended_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Omit<
            RecurringTransaction,
            | "id"
            | "user_id"
            | "is_active"
            | "ended_at"
            | "created_at"
            | "updated_at"
          >
        >;
        Relationships: [];
      };
      transfers: {
        Row: Transfer;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      transfer_entries: {
        Row: TransferEntry;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      credit_cards: {
        Row: CreditCard;
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          issuer: string;
          brand: CreditCardBrand;
          last_four_digits: string;
          credit_limit?: number;
          closing_day: number;
          due_day: number;
          currency?: SupportedCurrency;
          linked_account_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Omit<CreditCard, "id" | "user_id" | "created_at" | "updated_at">
        >;
        Relationships: [];
      };
      credit_card_purchases: {
        Row: CreditCardPurchase;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      credit_card_invoices: {
        Row: CreditCardInvoice;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      credit_card_installments: {
        Row: CreditCardInstallment;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      monthly_budgets: {
        Row: MonthlyBudget;
        Insert: {
          id?: string;
          user_id: string;
          category_id: string;
          reference_month: string;
          currency: SupportedCurrency;
          planned_amount_minor?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          planned_amount_minor?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      net_worth_items: {
        Row: NetWorthItem;
        Insert: {
          id?: string;
          user_id: string;
          kind: NetWorthItemKind;
          item_type: NetWorthItemType;
          name: string;
          currency: SupportedCurrency;
          current_value_minor: number;
          valuation_date: string;
          context: FinancialContext;
          notes?: string | null;
          is_active?: boolean;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Pick<
            NetWorthItem,
            | "item_type"
            | "name"
            | "current_value_minor"
            | "valuation_date"
            | "context"
            | "notes"
            | "is_active"
            | "archived_at"
          >
        >;
        Relationships: [];
      };
      net_worth_valuations: {
        Row: NetWorthValuation;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      investment_positions: {
        Row: InvestmentPosition;
        Insert: {
          id?: string;
          user_id: string;
          institution: string;
          investment_class: InvestmentClass;
          asset_name: string;
          currency: SupportedCurrency;
          quantity: string;
          accumulated_cost_minor: number;
          current_value_minor: number;
          position_date: string;
          context: FinancialContext;
          history_is_complete?: boolean;
          notes?: string | null;
          is_active?: boolean;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Pick<
            InvestmentPosition,
            | "institution"
            | "investment_class"
            | "asset_name"
            | "quantity"
            | "accumulated_cost_minor"
            | "current_value_minor"
            | "position_date"
            | "context"
            | "history_is_complete"
            | "notes"
            | "is_active"
            | "archived_at"
          >
        >;
        Relationships: [];
      };
      investment_position_snapshots: {
        Row: InvestmentPositionSnapshot;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      investment_cash_flows: {
        Row: InvestmentCashFlow;
        Insert: {
          id?: string;
          position_id: string;
          user_id: string;
          cash_flow_type: InvestmentCashFlowType;
          amount_minor: number;
          quantity?: string | null;
          cash_flow_date: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      import_jobs: {
        Row: ImportJob;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      import_staging_rows: {
        Row: ImportStagingRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      imported_transaction_signatures: {
        Row: ImportedTransactionSignature;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      critical_operation_events: {
        Row: CriticalOperationEvent;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      account_balances: {
        Row: AccountBalance;
        Relationships: [];
      };
      credit_card_summaries: {
        Row: CreditCardSummary;
        Relationships: [];
      };
      monthly_consumption: {
        Row: MonthlyConsumption;
        Relationships: [];
      };
      monthly_budget_progress: {
        Row: MonthlyBudgetProgress;
        Relationships: [];
      };
      financial_dashboard_monthly_summary: {
        Row: FinancialDashboardMonthlySummary;
        Relationships: [];
      };
      financial_dashboard_expense_categories: {
        Row: FinancialDashboardExpenseCategory;
        Relationships: [];
      };
      financial_dashboard_upcoming_recurrences: {
        Row: FinancialDashboardUpcomingRecurrence;
        Relationships: [];
      };
      financial_dashboard_invoices: {
        Row: FinancialDashboardInvoice;
        Relationships: [];
      };
      net_worth_summary: {
        Row: NetWorthSummary;
        Relationships: [];
      };
      investment_position_summary: {
        Row: InvestmentPositionSummary;
        Relationships: [];
      };
    };
    Functions: {
      seed_default_categories: {
        Args: { target_user_id: string };
        Returns: undefined;
      };
      create_transfer: {
        Args: {
          source_account_id: string;
          destination_account_id: string;
          amount_minor: number;
          transaction_date: string;
          transfer_status: TransactionStatus;
          transfer_description?: string | null;
          transfer_notes?: string | null;
        };
        Returns: string;
      };
      update_transfer: {
        Args: {
          target_transfer_id: string;
          source_account_id: string;
          destination_account_id: string;
          amount_minor: number;
          transaction_date: string;
          transfer_status: TransactionStatus;
          transfer_description?: string | null;
          transfer_notes?: string | null;
        };
        Returns: boolean;
      };
      set_transfer_active: {
        Args: {
          target_transfer_id: string;
          active: boolean;
        };
        Returns: boolean;
      };
      create_credit_card_purchase: {
        Args: {
          target_credit_card_id: string;
          target_category_id: string;
          purchase_description: string;
          purchase_total_amount: number;
          target_purchase_date: string;
          target_installment_count: number;
          purchase_notes?: string | null;
        };
        Returns: string;
      };
      update_credit_card_purchase: {
        Args: {
          target_purchase_id: string;
          target_category_id: string;
          purchase_description: string;
          purchase_total_amount: number;
          target_purchase_date: string;
          target_installment_count: number;
          purchase_notes?: string | null;
        };
        Returns: boolean;
      };
      cancel_credit_card_purchase: {
        Args: { target_purchase_id: string };
        Returns: boolean;
      };
      close_credit_card_invoice: {
        Args: { target_invoice_id: string };
        Returns: boolean;
      };
      pay_credit_card_invoice: {
        Args: {
          target_invoice_id: string;
          target_account_id: string;
          target_payment_date: string;
        };
        Returns: string;
      };
      reverse_credit_card_invoice_payment: {
        Args: { target_invoice_id: string };
        Returns: boolean;
      };
      recurrence_next_date: {
        Args: {
          anchor_date: string;
          current_occurrence: string;
          target_frequency: RecurrenceFrequency;
        };
        Returns: string;
      };
      set_recurring_transaction_state: {
        Args: {
          target_recurring_id: string;
          target_state: RecurringTransactionState;
        };
        Returns: boolean;
      };
      generate_recurring_transactions: {
        Args: { target_until: string };
        Returns: number;
      };
      copy_previous_month_budgets: {
        Args: {
          target_reference_month: string;
          target_context: FinancialContext;
          target_currency: SupportedCurrency;
        };
        Returns: number;
      };
      create_import_job: {
        Args: {
          target_file_name: string;
          target_file_type: ImportFileType;
          target_file_sha256: string;
          target_csv_config: Json | null;
          target_rows: Json;
        };
        Returns: string;
      };
      configure_import_job: {
        Args: {
          target_job_id: string;
          target_account_id: string;
        };
        Returns: boolean;
      };
      update_import_staging_row: {
        Args: {
          target_row_id: string;
          target_transaction_date: string;
          target_description: string;
          target_signed_amount_minor: number;
          target_category_id: string;
        };
        Returns: boolean;
      };
      set_import_staging_row_ignored: {
        Args: {
          target_row_id: string;
          target_ignored: boolean;
        };
        Returns: boolean;
      };
      confirm_import_job: {
        Args: { target_job_id: string };
        Returns: number;
      };
      cancel_import_job: {
        Args: { target_job_id: string };
        Returns: boolean;
      };
      clear_cancelled_import_jobs: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      record_critical_operation: {
        Args: {
          target_event_type: string;
          target_outcome: string;
          target_resource_type?: string | null;
        };
        Returns: string;
      };
      export_personal_backup: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      restore_personal_backup: {
        Args: { target_backup: Json };
        Returns: Json;
      };
      apply_import_retention: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
    };
    Enums: {
      account_type: AccountType;
      financial_context: FinancialContext;
      transaction_kind: "income" | "expense" | "transfer";
      transaction_status: TransactionStatus;
      transfer_direction: TransferDirection;
      credit_card_brand: CreditCardBrand;
      credit_card_purchase_status: CreditCardPurchaseStatus;
      credit_card_installment_status: CreditCardInstallmentStatus;
      credit_card_invoice_status: CreditCardInvoiceStatus;
      transaction_origin_type: TransactionOriginType;
      recurrence_frequency: RecurrenceFrequency;
      net_worth_kind: NetWorthItemKind;
      net_worth_item_type: NetWorthItemType;
      investment_class: InvestmentClass;
      investment_cash_flow_type: InvestmentCashFlowType;
    };
    CompositeTypes: Record<string, never>;
  };
};
