import { Injectable, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { AccountApi, CategoryApi, CurrencyApi, UserApi } from './api';
import { Account, AccountType, Category, CategoryType, Currency, User } from './models';
import { NotifyService } from './notify.service';

export interface CategoryOption {
  category: Category;
  depth: number;
  // Nom complet, ex. « Alimentation › Courses »
  path: string;
  color: string | null;
  icon: string | null;
}

/**
 * Données de référence partagées par les écrans (utilisateur, comptes, catégories, devises,
 * types de compte). Rechargées après chaque modification.
 */
@Injectable({ providedIn: 'root' })
export class DataStore {
  private readonly userApi = inject(UserApi);
  private readonly accountApi = inject(AccountApi);
  private readonly categoryApi = inject(CategoryApi);
  private readonly currencyApi = inject(CurrencyApi);
  private readonly notify = inject(NotifyService);

  readonly user = signal<User | null>(null);
  readonly accounts = signal<Account[]>([]);
  readonly accountTypes = signal<AccountType[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly currencies = signal<Currency[]>([]);
  readonly loaded = signal(false);
  // Incrémenté à chaque modification d'opérations : les écrans qui l'observent se rechargent
  readonly version = signal(0);

  readonly openAccounts = computed(() => this.accounts().filter((a) => !a.closed));
  readonly referenceCurrency = computed(() => this.user()?.referenceCurrency?.code ?? 'EUR');

  readonly categoriesById = computed(() => new Map(this.categories().map((c) => [c.id, c])));

  // Catégories triées en arbre (parent puis enfants), avec héritage de la couleur et de l'icône
  readonly categoryTree = computed<CategoryOption[]>(() => {
    const all = this.categories();
    const children = new Map<number | null, Category[]>();
    for (const category of all) {
      const list = children.get(category.parentId) ?? [];
      list.push(category);
      children.set(category.parentId, list);
    }
    children.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name, 'fr')));

    const result: CategoryOption[] = [];
    const walk = (parentId: number | null, depth: number, prefix: string, color: string | null, icon: string | null) => {
      for (const category of children.get(parentId) ?? []) {
        const path = prefix ? `${prefix} › ${category.name}` : category.name;
        const ownColor = category.color ?? color;
        const ownIcon = category.icon ?? icon;
        result.push({ category, depth, path, color: ownColor, icon: ownIcon });
        walk(category.id, depth + 1, path, ownColor, ownIcon);
      }
    };
    walk(null, 0, '', null, null);
    return result;
  });

  categoryOptions(type?: CategoryType): CategoryOption[] {
    return this.categoryTree().filter((o) => !type || o.category.type === type);
  }

  categoryOption(id: number | null | undefined): CategoryOption | undefined {
    return id == null ? undefined : this.categoryTree().find((o) => o.category.id === id);
  }

  account(id: number | null | undefined): Account | undefined {
    return this.accounts().find((a) => a.id === id);
  }

  loadAll(): void {
    forkJoin({
      user: this.userApi.me(),
      accounts: this.accountApi.list(),
      types: this.accountApi.types(),
      categories: this.categoryApi.list(),
      currencies: this.currencyApi.list(),
    }).subscribe({
      next: ({ user, accounts, types, categories, currencies }) => {
        this.user.set(user);
        this.accounts.set(accounts);
        this.accountTypes.set(types);
        this.categories.set(categories);
        this.currencies.set(currencies);
        this.loaded.set(true);
      },
      error: (error) => this.notify.error(error),
    });
  }

  // A appeler après toute création, modification ou suppression d'opérations
  transactionsChanged(): void {
    this.version.update((v) => v + 1);
    this.reloadAccounts();
  }

  reloadAccounts(): void {
    this.accountApi.list().subscribe({ next: (a) => this.accounts.set(a), error: (e) => this.notify.error(e) });
  }

  reloadAccountTypes(): void {
    this.accountApi.types().subscribe({ next: (t) => this.accountTypes.set(t), error: (e) => this.notify.error(e) });
  }

  reloadCategories(): void {
    this.categoryApi.list().subscribe({ next: (c) => this.categories.set(c), error: (e) => this.notify.error(e) });
  }

  reloadCurrencies(): void {
    this.currencyApi.list().subscribe({ next: (c) => this.currencies.set(c), error: (e) => this.notify.error(e) });
  }

  reloadUser(): void {
    this.userApi.me().subscribe({ next: (u) => this.user.set(u), error: (e) => this.notify.error(e) });
  }

  clear(): void {
    this.user.set(null);
    this.accounts.set([]);
    this.accountTypes.set([]);
    this.categories.set([]);
    this.currencies.set([]);
    this.loaded.set(false);
  }
}
