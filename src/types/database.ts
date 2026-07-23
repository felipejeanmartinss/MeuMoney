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
    };
    Views: Record<string, never>;
    Functions: {
      seed_default_categories: {
        Args: { target_user_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      account_type: AccountType;
      financial_context: FinancialContext;
      transaction_kind: "income" | "expense" | "transfer";
    };
    CompositeTypes: Record<string, never>;
  };
};
