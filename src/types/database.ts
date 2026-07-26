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
    };
    CompositeTypes: Record<string, never>;
  };
};
