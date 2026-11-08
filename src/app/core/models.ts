// Contrats de l'API hermes-api. Les dates sont au format ISO (yyyy-MM-dd), les montants en nombre.

export type TransactionDirection = 'DEBIT' | 'CREDIT';
export type TransactionStatus = 'PENDING' | 'CLEARED' | 'RECONCILED';
export type PaymentMethod = 'CARD' | 'TRANSFER' | 'DIRECT_DEBIT' | 'CHECK' | 'CASH' | 'OTHER';
export type CategoryType = 'EXPENSE' | 'INCOME';
export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type TransactionKind = 'EXPENSE' | 'INCOME' | 'TRANSFER';

export interface ApiError {
  status: number;
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
}

export interface User {
  id: string;
  createdAt: string;
  lastLoginAt: string | null;
  referenceCurrency: Currency | null;
}

export interface Currency {
  id: number;
  code: string;
  symbol: string;
  name: string;
  custom: boolean;
}

export interface CurrencyRequest {
  code: string;
  symbol: string;
  name: string;
}

export interface ExchangeRate {
  id: number;
  baseCurrency: Currency;
  quoteCurrency: Currency;
  rate: number;
  date: string;
}

export interface ExchangeRateRequest {
  baseCurrencyId: number;
  quoteCurrencyId: number;
  rate: number;
  date: string;
}

export interface ExchangeRateSyncResult {
  imported: number;
  unsupportedCurrencies: string[];
}

export interface AccountType {
  id: number;
  name: string;
  savings: boolean;
}

export interface AccountTypeRequest {
  name: string;
  savings: boolean;
}

export interface Account {
  id: number;
  name: string;
  description: string | null;
  bankName: string | null;
  accountType: AccountType;
  currency: Currency;
  initialBalance: number;
  balance: number;
  forecastBalance: number;
  clearedBalance: number;
  openingDate: string;
  closed: boolean;
}

export interface AccountRequest {
  name: string;
  description: string | null;
  bankName: string | null;
  accountTypeId: number;
  currencyId: number;
  initialBalance: number;
  openingDate: string;
  closed: boolean;
}

export interface Reconciliation {
  id: number;
  statementDate: string;
  statementBalance: number;
  transactionCount: number;
  createdAt: string;
}

export interface ReconciliationStatus {
  clearedBalance: number;
  clearedCount: number;
  lastReconciliation: Reconciliation | null;
}

export interface Category {
  id: number;
  name: string;
  type: CategoryType;
  parentId: number | null;
  color: string | null;
  icon: string | null;
}

export interface CategoryRequest {
  name: string;
  type: CategoryType;
  parentId: number | null;
  color: string | null;
  icon: string | null;
}

export interface CategorySummary {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
}

export interface Transaction {
  id: number;
  accountId: number;
  accountName: string;
  currencyCode: string;
  direction: TransactionDirection;
  amount: number;
  label: string;
  payee: string | null;
  notes: string | null;
  category: CategorySummary | null;
  paymentMethod: PaymentMethod | null;
  operationDate: string;
  valueDate: string | null;
  status: TransactionStatus;
  transfer: { peerTransactionId: number; accountId: number; accountName: string } | null;
  recurringTransactionId: number | null;
  // Dépense récurrente remboursée par cette opération
  reimbursement: {
    recurringTransactionId: number;
    label: string;
    payerId: number;
    payerName: string;
    period: ReimbursementPeriod;
    periodStart: string;
  } | null;
  createdAt: string;
}

export interface TransactionRequest {
  accountId: number;
  direction: TransactionDirection;
  amount: number;
  label: string;
  payee: string | null;
  notes: string | null;
  categoryId: number | null;
  paymentMethod: PaymentMethod | null;
  operationDate: string;
  valueDate: string | null;
  status?: TransactionStatus;
}

export interface TransactionFilter {
  accountIds?: number[];
  from?: string;
  to?: string;
  categoryIds?: number[];
  uncategorized?: boolean;
  kind?: TransactionKind;
  status?: TransactionStatus;
  search?: string;
  minAmount?: number;
  maxAmount?: number;
  // Opérations générées par cette récurrence
  recurringTransactionId?: number;
}

export interface TransactionTotals {
  currencyCode: string;
  count: number;
  credits: number;
  debits: number;
  net: number;
}

export type TransactionSortField = 'date' | 'label' | 'account' | 'amount';

export interface TransactionSort {
  field: TransactionSortField;
  direction: 'asc' | 'desc';
}

export interface BulkCategoryResult {
  updated: number;
  skippedTransfers: number;
}

export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface PayeeSuggestion {
  payee: string;
  usage: number;
  lastCategoryId: number | null;
}

export interface TransferRequest {
  fromAccountId: number;
  toAccountId: number;
  amount: number;
  targetAmount: number | null;
  label: string | null;
  notes: string | null;
  operationDate: string;
}

export interface Transfer {
  debit: Transaction;
  credit: Transaction;
}

export interface RecurringTransaction {
  id: number;
  accountId: number;
  accountName: string;
  currencyCode: string;
  targetAccountId: number | null;
  targetAccountName: string | null;
  targetCurrencyCode: string | null;
  direction: TransactionDirection;
  amount: number;
  targetAmount: number | null;
  label: string;
  payee: string | null;
  category: CategorySummary | null;
  paymentMethod: PaymentMethod | null;
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: string;
  endDate: string | null;
  nextDate: string | null;
  occurrenceCount: number;
  active: boolean;
  transfer: boolean;
  reimbursementPayers: ReimbursementPayer[];
}

// Tiers qui rembourse une part (en %) d'une dépense récurrente
export interface ReimbursementPayer {
  id: number;
  name: string;
  share: number;
  period: ReimbursementPeriod;
  // Début de la première période due (yyyy-MM-dd)
  startDate: string;
}

export type ReimbursementPeriod = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export type ReimbursementStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'IN_PROGRESS';

export interface ReimbursementPayment {
  transactionId: number;
  date: string;
  amount: number;
  label: string;
  accountName: string;
}

export interface ReimbursementPeriodStatus {
  start: string;
  end: string;
  ended: boolean;
  expenses: number;
  due: number;
  received: number;
  // Part due couverte par le trop-perçu des périodes précédentes
  advanceUsed: number;
  remaining: number;
  // Trop-perçu restant après cette période, reporté sur les suivantes
  surplus: number;
  status: ReimbursementStatus;
  payments: ReimbursementPayment[];
}

// Suivi d'un tiers, période la plus récente d'abord
export interface PayerTracking {
  payerId: number;
  name: string;
  share: number;
  period: ReimbursementPeriod;
  periods: ReimbursementPeriodStatus[];
}

// Suivi d'une dépense récurrente remboursée par des tiers
export interface ReimbursementTracking {
  recurringTransactionId: number;
  label: string;
  currencyCode: string;
  payers: PayerTracking[];
}

export interface RecurringTransactionRequest {
  accountId: number;
  targetAccountId: number | null;
  direction: TransactionDirection | null;
  amount: number;
  targetAmount: number | null;
  label: string;
  payee: string | null;
  categoryId: number | null;
  paymentMethod: PaymentMethod | null;
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: string;
  endDate: string | null;
  active: boolean;
  reimbursementPayers: (Omit<ReimbursementPayer, 'id'> & { id: number | null })[];
}

export interface UpcomingOccurrence {
  recurringTransactionId: number;
  date: string;
  label: string;
  direction: TransactionDirection;
  amount: number;
  accountId: number;
  accountName: string;
  currencyCode: string;
  transfer: boolean;
  targetAccountId: number | null;
  targetAccountName: string | null;
  targetAmount: number | null;
}

export interface CsvInspection {
  encoding: string;
  separator: string;
  columnCount: number;
  rows: string[][];
}

export interface CsvImportOptions {
  encoding?: string;
  separator?: string;
  skipLines: number;
  hasHeader: boolean;
  dateColumn: number;
  dateFormat: string;
  valueDateColumn?: number | null;
  labelColumns: number[];
  payeeColumn?: number | null;
  amountColumn?: number | null;
  debitColumn?: number | null;
  creditColumn?: number | null;
  decimalSeparator?: string;
  negateAmounts: boolean;
}

export interface ImportRow {
  operationDate: string;
  valueDate: string | null;
  label: string;
  payee: string | null;
  notes: string | null;
  amount: number;
  direction: TransactionDirection;
  categoryId: number | null;
  paymentMethod: PaymentMethod | null;
  importId: string | null;
  duplicate: boolean;
}

export interface ImportPreview {
  format: 'CSV' | 'OFX';
  rows: ImportRow[];
  warnings: string[];
}

// ---------- Statistiques ----------

export interface StatsSummary {
  currencyCode: string;
  from: string;
  to: string;
  income: number;
  expenses: number;
  net: number;
  savings: number;
  savingsRate: number | null;
  previousIncome: number;
  previousExpenses: number;
  netWorth: number;
  missingRates: string[];
}

export interface StatsList<T> {
  currencyCode: string;
  missingRates: string[];
  items: T[];
}

export interface CategoryStat {
  categoryId: number | null;
  name: string;
  color: string | null;
  icon: string | null;
  amount: number;
  share: number;
  count: number;
  hasChildren: boolean;
  direct: boolean;
}

export interface MonthlyStat {
  month: string;
  income: number;
  expenses: number;
  net: number;
  savings: number;
}

export interface CategoryTrendStat {
  month: string;
  amount: number;
}

export interface PayeeStat {
  payee: string;
  amount: number;
  count: number;
}

export interface BalancePoint {
  date: string;
  value: number;
}

export interface BalanceHistory {
  currencyCode: string;
  missingRates: string[];
  points: BalancePoint[];
  accounts: {
    accountId: number;
    name: string;
    currencyCode: string;
    savings: boolean;
    points: BalancePoint[];
  }[];
}

export interface SavingsStats {
  currencyCode: string;
  missingRates: string[];
  totalDeposits: number;
  totalWithdrawals: number;
  net: number;
  currentSavingsBalance: number;
  savingsRate: number | null;
  months: {
    month: string;
    deposits: number;
    withdrawals: number;
    net: number;
    balance: number;
    savingsRate: number | null;
  }[];
}
