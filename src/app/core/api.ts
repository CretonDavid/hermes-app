import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Account,
  AccountRequest,
  AccountType,
  AccountTypeRequest,
  BalanceHistory,
  BulkCategoryResult,
  Category,
  CategoryRequest,
  CategoryStat,
  CategoryTrendStat,
  CategoryType,
  CsvImportOptions,
  CsvInspection,
  Currency,
  CurrencyRequest,
  ExchangeRate,
  ExchangeRateRequest,
  ExchangeRateSyncResult,
  ImportPreview,
  ImportRow,
  MonthlyStat,
  Page,
  PayeeStat,
  PayeeSuggestion,
  Reconciliation,
  ReconciliationStatus,
  RecurringTransaction,
  RecurringTransactionRequest,
  ReimbursementTracking,
  SavingsStats,
  StatsList,
  StatsSummary,
  Transaction,
  TransactionFilter,
  TransactionRequest,
  TransactionSort,
  TransactionStatus,
  TransactionTotals,
  Transfer,
  TransferRequest,
  UpcomingOccurrence,
  User,
} from './models';

const API = environment.apiUrl;

/**
 * Transforme un objet en paramètres de requête, en ignorant les valeurs vides.
 * Les tableaux sont répétés (accountIds=1&accountIds=2).
 */
export function toParams(values: object): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    if (Array.isArray(value)) {
      value.forEach((v) => (params = params.append(key, String(v))));
    } else {
      params = params.set(key, String(value));
    }
  }
  return params;
}

export interface StatsQuery {
  from?: string;
  to?: string;
  accountIds?: number[];
}

@Injectable({ providedIn: 'root' })
export class UserApi {
  private readonly http = inject(HttpClient);

  me(): Observable<User> {
    return this.http.get<User>(`${API}/users/me`);
  }

  update(referenceCurrencyId: number): Observable<User> {
    return this.http.patch<User>(`${API}/users/me`, { referenceCurrencyId });
  }

  disable(): Observable<void> {
    return this.http.post<void>(`${API}/users/me/disable`, null);
  }

  delete(accountNumber: string): Observable<void> {
    return this.http.delete<void>(`${API}/users/me`, { body: { accountNumber } });
  }
}

@Injectable({ providedIn: 'root' })
export class CurrencyApi {
  private readonly http = inject(HttpClient);

  list(): Observable<Currency[]> {
    return this.http.get<Currency[]>(`${API}/currencies`);
  }

  create(request: CurrencyRequest): Observable<Currency> {
    return this.http.post<Currency>(`${API}/currencies`, request);
  }

  update(id: number, request: CurrencyRequest): Observable<Currency> {
    return this.http.put<Currency>(`${API}/currencies/${id}`, request);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/currencies/${id}`);
  }

  rates(latest: boolean, currencyId?: number): Observable<ExchangeRate[]> {
    return this.http.get<ExchangeRate[]>(`${API}/exchange-rates`, {
      params: toParams({ latest, currencyId }),
    });
  }

  createRate(request: ExchangeRateRequest): Observable<ExchangeRate> {
    return this.http.post<ExchangeRate>(`${API}/exchange-rates`, request);
  }

  updateRate(id: number, request: ExchangeRateRequest): Observable<ExchangeRate> {
    return this.http.put<ExchangeRate>(`${API}/exchange-rates/${id}`, request);
  }

  deleteRate(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/exchange-rates/${id}`);
  }

  syncRates(from?: string): Observable<ExchangeRateSyncResult> {
    return this.http.post<ExchangeRateSyncResult>(`${API}/exchange-rates/sync`, null, {
      params: toParams({ from }),
    });
  }
}

@Injectable({ providedIn: 'root' })
export class AccountApi {
  private readonly http = inject(HttpClient);

  list(): Observable<Account[]> {
    return this.http.get<Account[]>(`${API}/accounts`);
  }

  get(id: number): Observable<Account> {
    return this.http.get<Account>(`${API}/accounts/${id}`);
  }

  create(request: AccountRequest): Observable<Account> {
    return this.http.post<Account>(`${API}/accounts`, request);
  }

  update(id: number, request: AccountRequest): Observable<Account> {
    return this.http.put<Account>(`${API}/accounts/${id}`, request);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/accounts/${id}`);
  }

  types(): Observable<AccountType[]> {
    return this.http.get<AccountType[]>(`${API}/account-types`);
  }

  createType(request: AccountTypeRequest): Observable<AccountType> {
    return this.http.post<AccountType>(`${API}/account-types`, request);
  }

  updateType(id: number, request: AccountTypeRequest): Observable<AccountType> {
    return this.http.put<AccountType>(`${API}/account-types/${id}`, request);
  }

  deleteType(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/account-types/${id}`);
  }

  reconciliations(id: number): Observable<Reconciliation[]> {
    return this.http.get<Reconciliation[]>(`${API}/accounts/${id}/reconciliations`);
  }

  reconciliationStatus(id: number): Observable<ReconciliationStatus> {
    return this.http.get<ReconciliationStatus>(`${API}/accounts/${id}/reconciliation-status`);
  }

  reconcile(
    id: number,
    statementDate: string,
    statementBalance: number,
  ): Observable<Reconciliation> {
    return this.http.post<Reconciliation>(`${API}/accounts/${id}/reconciliations`, {
      statementDate,
      statementBalance,
    });
  }

  undoReconciliation(id: number, reconciliationId: number): Observable<void> {
    return this.http.delete<void>(`${API}/accounts/${id}/reconciliations/${reconciliationId}`);
  }
}

@Injectable({ providedIn: 'root' })
export class CategoryApi {
  private readonly http = inject(HttpClient);

  list(): Observable<Category[]> {
    return this.http.get<Category[]>(`${API}/categories`);
  }

  create(request: CategoryRequest): Observable<Category> {
    return this.http.post<Category>(`${API}/categories`, request);
  }

  update(id: number, request: CategoryRequest): Observable<Category> {
    return this.http.put<Category>(`${API}/categories/${id}`, request);
  }

  delete(id: number, replacementId?: number | null): Observable<void> {
    return this.http.delete<void>(`${API}/categories/${id}`, {
      params: toParams({ replacementId }),
    });
  }
}

@Injectable({ providedIn: 'root' })
export class TransactionApi {
  private readonly http = inject(HttpClient);

  search(
    filter: TransactionFilter,
    page = 0,
    size = 50,
    sort?: TransactionSort,
  ): Observable<Page<Transaction>> {
    return this.http.get<Page<Transaction>>(`${API}/transactions`, {
      params: toParams({ ...filter, page, size, sort: sort?.field, direction: sort?.direction }),
    });
  }

  totals(filter: TransactionFilter): Observable<TransactionTotals[]> {
    return this.http.get<TransactionTotals[]>(`${API}/transactions/totals`, {
      params: toParams({ ...filter }),
    });
  }

  updateCategory(
    transactionIds: number[],
    categoryId: number | null,
  ): Observable<BulkCategoryResult> {
    return this.http.patch<BulkCategoryResult>(`${API}/transactions/category`, {
      transactionIds,
      categoryId,
    });
  }

  get(id: number): Observable<Transaction> {
    return this.http.get<Transaction>(`${API}/transactions/${id}`);
  }

  create(request: TransactionRequest): Observable<Transaction> {
    return this.http.post<Transaction>(`${API}/transactions`, request);
  }

  update(id: number, request: TransactionRequest): Observable<Transaction> {
    return this.http.put<Transaction>(`${API}/transactions/${id}`, request);
  }

  setStatus(id: number, status: TransactionStatus): Observable<Transaction> {
    return this.http.patch<Transaction>(`${API}/transactions/${id}/status`, { status });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/transactions/${id}`);
  }

  payees(q: string, limit = 10): Observable<PayeeSuggestion[]> {
    return this.http.get<PayeeSuggestion[]>(`${API}/transactions/payees`, {
      params: toParams({ q, limit }),
    });
  }

  getTransfer(transactionId: number): Observable<Transfer> {
    return this.http.get<Transfer>(`${API}/transfers/${transactionId}`);
  }

  createTransfer(request: TransferRequest): Observable<Transfer> {
    return this.http.post<Transfer>(`${API}/transfers`, request);
  }

  updateTransfer(transactionId: number, request: TransferRequest): Observable<Transfer> {
    return this.http.put<Transfer>(`${API}/transfers/${transactionId}`, request);
  }
}

@Injectable({ providedIn: 'root' })
export class RecurringApi {
  private readonly http = inject(HttpClient);

  list(): Observable<RecurringTransaction[]> {
    return this.http.get<RecurringTransaction[]>(`${API}/recurring-transactions`);
  }

  upcoming(days: number): Observable<UpcomingOccurrence[]> {
    return this.http.get<UpcomingOccurrence[]>(`${API}/recurring-transactions/upcoming`, {
      params: toParams({ days }),
    });
  }

  create(request: RecurringTransactionRequest): Observable<RecurringTransaction> {
    return this.http.post<RecurringTransaction>(`${API}/recurring-transactions`, request);
  }

  update(id: number, request: RecurringTransactionRequest): Observable<RecurringTransaction> {
    return this.http.put<RecurringTransaction>(`${API}/recurring-transactions/${id}`, request);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/recurring-transactions/${id}`);
  }

  reimbursements(): Observable<ReimbursementTracking[]> {
    return this.http.get<ReimbursementTracking[]>(`${API}/recurring-transactions/reimbursements`);
  }

  // period : n'importe quelle date de la période couverte
  linkReimbursement(
    id: number,
    payerId: number,
    transactionId: number,
    period: string,
  ): Observable<void> {
    return this.http.post<void>(`${API}/recurring-transactions/${id}/reimbursements`, {
      payerId,
      transactionId,
      period,
    });
  }

  unlinkReimbursement(id: number, transactionId: number): Observable<void> {
    return this.http.delete<void>(
      `${API}/recurring-transactions/${id}/reimbursements/${transactionId}`,
    );
  }
}

@Injectable({ providedIn: 'root' })
export class ImportApi {
  private readonly http = inject(HttpClient);

  inspectCsv(file: File, encoding?: string): Observable<CsvInspection> {
    return this.http.post<CsvInspection>(`${API}/imports/csv/inspect`, this.form(file), {
      params: toParams({ encoding }),
    });
  }

  previewCsv(file: File, accountId: number, options: CsvImportOptions): Observable<ImportPreview> {
    return this.http.post<ImportPreview>(`${API}/imports/csv/preview`, this.form(file), {
      params: toParams({ accountId, ...options }),
    });
  }

  previewOfx(file: File, accountId: number): Observable<ImportPreview> {
    return this.http.post<ImportPreview>(`${API}/imports/ofx/preview`, this.form(file), {
      params: toParams({ accountId }),
    });
  }

  confirm(accountId: number, rows: ImportRow[]): Observable<{ imported: number }> {
    return this.http.post<{ imported: number }>(`${API}/imports/confirm`, { accountId, rows });
  }

  private form(file: File): FormData {
    const data = new FormData();
    data.append('file', file);
    return data;
  }
}

@Injectable({ providedIn: 'root' })
export class StatsApi {
  private readonly http = inject(HttpClient);

  summary(query: StatsQuery): Observable<StatsSummary> {
    return this.http.get<StatsSummary>(`${API}/stats/summary`, { params: toParams(query) });
  }

  categories(
    query: StatsQuery & { type: CategoryType; parentId?: number | null },
  ): Observable<StatsList<CategoryStat>> {
    return this.http.get<StatsList<CategoryStat>>(`${API}/stats/categories`, {
      params: toParams(query),
    });
  }

  monthly(query: StatsQuery): Observable<StatsList<MonthlyStat>> {
    return this.http.get<StatsList<MonthlyStat>>(`${API}/stats/monthly`, {
      params: toParams(query),
    });
  }

  categoryTrend(
    query: StatsQuery & { categoryId: number },
  ): Observable<StatsList<CategoryTrendStat>> {
    return this.http.get<StatsList<CategoryTrendStat>>(`${API}/stats/category-trend`, {
      params: toParams(query),
    });
  }

  payees(query: StatsQuery & { limit?: number }): Observable<StatsList<PayeeStat>> {
    return this.http.get<StatsList<PayeeStat>>(`${API}/stats/payees`, { params: toParams(query) });
  }

  balanceHistory(
    query: StatsQuery & { granularity?: 'DAY' | 'WEEK' | 'MONTH' },
  ): Observable<BalanceHistory> {
    return this.http.get<BalanceHistory>(`${API}/stats/balance-history`, {
      params: toParams(query),
    });
  }

  savings(query: StatsQuery): Observable<SavingsStats> {
    return this.http.get<SavingsStats>(`${API}/stats/savings`, { params: toParams(query) });
  }
}
