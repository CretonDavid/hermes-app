import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import { subYears } from 'date-fns';
import { AccountApi, CurrencyApi, UserApi } from '../../core/api';
import { AuthService } from '../../core/auth/auth.service';
import { DataStore } from '../../core/data.store';
import { toIsoDate } from '../../core/format';
import { AccountType, Currency, ExchangeRate } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { APP_VERSION } from '../../core/version';
import { confirm } from '../../shared/confirm-dialog.component';
import { AccountTypeDialogComponent } from '../accounts/account-type-dialog.component';
import { CurrencyDialogComponent } from './currency-dialog.component';
import { RateDialogComponent } from './rate-dialog.component';

const TABS = ['profile', 'types', 'currencies', 'rates'];

@Component({
  selector: 'app-settings',
  imports: [
    FormsModule,
    DatePipe,
    DecimalPipe,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatSlideToggleModule,
    MatTooltipModule,
    MatProgressBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  protected readonly version = APP_VERSION;
  protected readonly store = inject(DataStore);
  private readonly userApi = inject(UserApi);
  private readonly accountApi = inject(AccountApi);
  private readonly currencyApi = inject(CurrencyApi);
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  protected readonly tabIndex = signal(
    Math.max(0, TABS.indexOf(inject(ActivatedRoute).snapshot.queryParamMap.get('tab') ?? '')),
  );
  protected readonly rates = signal<ExchangeRate[]>([]);
  protected readonly allRates = signal(false);
  protected readonly syncing = signal(false);
  protected syncFrom: Date | null = subYears(new Date(), 1);
  protected deleteNumber = '';

  protected deleteDigits(): number {
    return this.deleteNumber.replace(/\D/g, '').length;
  }

  protected readonly customCurrencies = computed(() =>
    this.store.currencies().filter((c) => c.custom),
  );
  protected readonly defaultCurrencies = computed(() =>
    this.store.currencies().filter((c) => !c.custom),
  );
  // Devises utilisées par les comptes et différentes de la devise de référence : il leur faut un taux
  protected readonly foreignCurrencies = computed(() => {
    const reference = this.store.referenceCurrency();
    return [...new Set(this.store.accounts().map((a) => a.currency.code))].filter(
      (c) => c !== reference,
    );
  });

  constructor() {
    effect(() => {
      this.allRates();
      this.store.version();
      untracked(() => this.loadRates());
    });
  }

  // ---------- Profil ----------

  protected setReferenceCurrency(currencyId: number): void {
    this.userApi.update(currencyId).subscribe({
      next: (user) => {
        this.store.user.set(user);
        this.store.transactionsChanged();
        this.notify.success('Devise de référence modifiée');
      },
      error: (error) => this.notify.error(error),
    });
  }

  protected disable(): void {
    confirm(this.dialog, {
      title: 'Désactiver mon compte',
      message:
        'Vous serez déconnecté et ne pourrez plus vous connecter tant que votre compte est désactivé. Vos données sont conservées : vous pourrez le réactiver depuis la page de connexion avec votre numéro.',
      confirmLabel: 'Désactiver',
      danger: true,
    }).subscribe((ok) => {
      if (ok) {
        this.userApi.disable().subscribe({
          next: () => {
            this.auth.logout();
          },
          error: (error) => this.notify.error(error),
        });
      }
    });
  }

  protected deleteAccount(): void {
    const number = this.deleteNumber.replace(/\D/g, '');
    confirm(this.dialog, {
      title: 'Supprimer définitivement mon compte',
      message:
        'Toutes vos données (comptes bancaires, opérations, catégories, statistiques) seront effacées. Cette action est irréversible.',
      confirmLabel: 'Tout supprimer',
      danger: true,
    }).subscribe((ok) => {
      if (ok) {
        this.userApi.delete(number).subscribe({
          next: () => {
            this.auth.logout();
          },
          error: (error) => this.notify.error(error),
        });
      }
    });
  }

  // ---------- Types de compte ----------

  protected createType(): void {
    AccountTypeDialogComponent.open(this.dialog);
  }

  protected editType(type: AccountType): void {
    AccountTypeDialogComponent.open(this.dialog, type);
  }

  protected deleteType(type: AccountType): void {
    this.confirmDelete(`le type « ${type.name} »`, () =>
      this.accountApi.deleteType(type.id).subscribe({
        next: () => {
          this.notify.success('Type de compte bancaire supprimé');
          this.store.reloadAccountTypes();
        },
        error: (error) => this.notify.error(error),
      }),
    );
  }

  private confirmDelete(what: string, action: () => void): void {
    confirm(this.dialog, {
      title: 'Confirmer la suppression',
      message: `Supprimer ${what} ?`,
      confirmLabel: 'Supprimer',
      danger: true,
    }).subscribe((ok) => ok && action());
  }

  // ---------- Devises ----------

  protected createCurrency(): void {
    CurrencyDialogComponent.open(this.dialog);
  }

  protected editCurrency(currency: Currency): void {
    CurrencyDialogComponent.open(this.dialog, currency);
  }

  protected deleteCurrency(currency: Currency): void {
    this.confirmDelete(`la devise ${currency.code} et ses taux de change`, () =>
      this.currencyApi.delete(currency.id).subscribe({
        next: () => {
          this.notify.success('Devise supprimée');
          this.store.reloadCurrencies();
        },
        error: (error) => this.notify.error(error),
      }),
    );
  }

  // ---------- Taux de change ----------

  protected sync(history: boolean): void {
    this.syncing.set(true);
    this.currencyApi
      .syncRates(history ? (toIsoDate(this.syncFrom) ?? undefined) : undefined)
      .subscribe({
        next: (result) => {
          this.syncing.set(false);
          const unsupported = result.unsupportedCurrencies.length
            ? ` · non couvertes par la BCE : ${result.unsupportedCurrencies.join(', ')}`
            : '';
          this.notify.success(`${result.imported} taux importé(s)${unsupported}`);
          this.store.transactionsChanged();
        },
        error: (error) => {
          this.syncing.set(false);
          this.notify.error(error);
        },
      });
  }

  protected createRate(): void {
    RateDialogComponent.open(this.dialog);
  }

  protected editRate(rate: ExchangeRate): void {
    RateDialogComponent.open(this.dialog, rate);
  }

  protected deleteRate(rate: ExchangeRate): void {
    this.confirmDelete(
      `le taux ${rate.baseCurrency.code}/${rate.quoteCurrency.code} du ${rate.date.split('-').reverse().join('/')}`,
      () =>
        this.currencyApi.deleteRate(rate.id).subscribe({
          next: () => {
            this.notify.success('Taux supprimé');
            this.store.transactionsChanged();
          },
          error: (error) => this.notify.error(error),
        }),
    );
  }

  private loadRates(): void {
    this.currencyApi.rates(!this.allRates()).subscribe({
      next: (rates) => this.rates.set(this.allRates() ? rates.slice(0, 500) : rates),
      error: (error) => this.notify.error(error),
    });
  }
}
