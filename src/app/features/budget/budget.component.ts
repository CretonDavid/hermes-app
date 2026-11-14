import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { addMonths, endOfMonth, format, isSameMonth } from 'date-fns';
import { BudgetApi, GoalApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { toIsoDate } from '../../core/format';
import { Budget, BudgetEnvelope, Goal } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { BudgetBarComponent, budgetLevel } from '../../shared/budget-bar.component';
import { MoneyPipe, formatMoney } from '../../shared/money.pipe';
import { confirm } from '../../shared/confirm-dialog.component';
import { EnvelopeDialogComponent } from './envelope-dialog.component';
import { GoalAdjustDialogComponent } from './goal-adjust-dialog.component';
import { GoalDialogComponent } from './goal-dialog.component';
import { GoalUseDialogComponent } from './goal-use-dialog.component';

// Couleurs des budgets spéciaux d'un même compte dans la barre de répartition
const GOAL_COLORS = ['#b39ddb', '#f4b942', '#4fd1b5', '#ff8fa8', '#64b5f6', '#ffb74d'];

interface GoalAccount {
  id: number;
  name: string;
  currencyCode: string;
  balance: number;
  // Total mis de côté dans les budgets spéciaux du compte
  allocated: number;
  free: number;
  freePercent: number;
  allocatedPercent: number;
  parts: { goal: Goal; color: string; percent: number }[];
}

// Budget du mois : une enveloppe par catégorie de dépense, comparée aux dépenses du mois
@Component({
  selector: 'app-budget',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatButtonToggleModule,
    MatMenuModule,
    MatTooltipModule,
    MoneyPipe,
    BudgetBarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <div style="flex: 1">
          <h1>Budget</h1>
          <div class="subtitle">Enveloppes mensuelles par catégorie de dépense</div>
        </div>
        <div class="month-nav">
          <button matIconButton (click)="shift(-1)" aria-label="Mois précédent">
            <mat-icon>chevron_left</mat-icon>
          </button>
          <span class="month" aria-live="polite">{{ month() | date: 'MMMM yyyy' }}</span>
          <button matIconButton (click)="shift(1)" aria-label="Mois suivant">
            <mat-icon>chevron_right</mat-icon>
          </button>
          <button matButton (click)="month.set(today)" [disabled]="isCurrentMonth()">
            Ce mois-ci
          </button>
        </div>
        <button matButton="filled" (click)="create()">
          <mat-icon>add</mat-icon> Nouvelle enveloppe
        </button>
      </div>

      @if (budget(); as b) {
        @if (b.missingRates.length) {
          <div class="card warning-card">
            <mat-icon>currency_exchange</mat-icon>
            Taux de change manquants pour {{ b.missingRates.join(', ') }} : ces dépenses ne sont pas
            comptées.
            <a routerLink="/settings" [queryParams]="{ tab: 'rates' }">Ajouter des taux</a>
          </div>
        }

        @if (b.envelopes.length) {
          <div class="grid grid-3 kpis">
            <div class="card kpi">
              <div class="label">Budget du mois</div>
              <div class="value amount">{{ b.budgeted | money: b.currencyCode }}</div>
              <div class="delta muted">
                {{ b.envelopes.length }} enveloppe{{ b.envelopes.length > 1 ? 's' : '' }}
              </div>
            </div>
            <div class="card kpi">
              <div class="label">Dépensé dans les enveloppes</div>
              <div class="value amount">{{ b.spent | money: b.currencyCode }}</div>
              <app-budget-bar class="kpi-bar" [spent]="b.spent" [amount]="b.budgeted" />
            </div>
            <div class="card kpi">
              <div class="label">{{ b.spent > b.budgeted ? 'Dépassement' : 'Reste' }}</div>
              <div class="value amount" [class.negative]="b.spent > b.budgeted">
                {{ abs(b.budgeted - b.spent) | money: b.currencyCode }}
              </div>
              <div class="delta muted">
                Hors enveloppe : {{ b.unbudgeted | money: b.currencyCode }}
                <mat-icon
                  class="info"
                  matTooltip="Dépenses du mois dans des catégories sans enveloppe, non catégorisées comprises"
                  >info</mat-icon
                >
              </div>
            </div>
          </div>

          <div class="card">
            <h2><mat-icon>donut_large</mat-icon> Enveloppes</h2>
            @for (e of b.envelopes; track e.id) {
              <div class="envelope">
                <span class="icon" [style.background]="color(e)">
                  <mat-icon>{{ icon(e) }}</mat-icon>
                </span>
                <div class="body">
                  <div class="line">
                    <a
                      class="name"
                      routerLink="/transactions"
                      [queryParams]="transactionsLink(e)"
                      matTooltip="Voir les opérations du mois"
                      >{{ e.category.name }}</a
                    >
                    @if (e.monthOnly) {
                      <span class="chip" matTooltip="Montant propre à ce mois">Ce mois-ci</span>
                    }
                    <span class="spacer"></span>
                    <span class="amount figures">
                      {{ e.spent | money: b.currencyCode }}
                      <span class="muted">/ {{ e.amount | money: b.currencyCode }}</span>
                    </span>
                  </div>
                  <app-budget-bar [spent]="e.spent" [amount]="e.amount" />
                  <div class="status" [class]="level(e)">
                    @if (e.remaining < 0) {
                      Dépassé de {{ -e.remaining | money: b.currencyCode }}
                    } @else {
                      Reste {{ e.remaining | money: b.currencyCode }}
                    }
                  </div>
                </div>
                <button
                  matIconButton
                  (click)="edit(e)"
                  matTooltip="Modifier l'enveloppe"
                  [attr.aria-label]="'Modifier l’enveloppe ' + e.category.name"
                >
                  <mat-icon>edit</mat-icon>
                </button>
              </div>
            }
          </div>
        } @else {
          <div class="card empty-state">
            <mat-icon>donut_large</mat-icon>
            <h2>Aucune enveloppe pour {{ month() | date: 'MMMM yyyy' }}</h2>
            <p class="muted">
              Fixez un montant mensuel par catégorie de dépense (Alimentation, Loisirs…) pour suivre
              ce qu'il reste à dépenser.
            </p>
            <button matButton="filled" (click)="create()">
              <mat-icon>add</mat-icon> Créer une enveloppe
            </button>
          </div>
        }
      }

      <!-- Budgets spéciaux : objectifs d'épargne mis de côté sur un compte, indépendants du mois -->
      <div class="section-header">
        <h2><mat-icon>flag</mat-icon> Budgets spéciaux</h2>
        <button matButton="tonal" (click)="createGoal()">
          <mat-icon>add</mat-icon> Nouveau budget spécial
        </button>
      </div>
      @if (activeGoals().length) {
        @if (goalAccounts().length > 1) {
          <mat-button-toggle-group
            class="account-filter"
            [value]="accountFilter()"
            (change)="accountFilter.set($event.value)"
            hideSingleSelectionIndicator
            aria-label="Compte bancaire affiché"
          >
            <mat-button-toggle [value]="null">Tous les comptes</mat-button-toggle>
            @for (a of goalAccounts(); track a.id) {
              <mat-button-toggle [value]="a.id">{{ a.name }}</mat-button-toggle>
            }
          </mat-button-toggle-group>
        }

        <!-- Part de chaque compte mise de côté dans ses budgets spéciaux -->
        <div class="accounts-grid" [class.single]="shownAccounts().length === 1">
          @for (a of shownAccounts(); track a.id) {
            <div class="card account-split">
              <div class="split-head">
                <mat-icon>account_balance</mat-icon>
                <a class="split-name" [routerLink]="['/accounts', a.id]">{{ a.name }}</a>
                <span class="spacer"></span>
                <span class="muted">Solde</span>
                <span class="amount split-balance">{{ a.balance | money: a.currencyCode }}</span>
              </div>
              <div class="stack" role="img" [attr.aria-label]="stackLabel(a)">
                @for (part of a.parts; track part.goal.id) {
                  <div
                    class="segment"
                    [style.width.%]="part.percent"
                    [style.background]="part.color"
                    [matTooltip]="
                      part.goal.name + ' : ' + (part.goal.savedAmount | money: a.currencyCode)
                    "
                  ></div>
                }
                @if (a.free > 0) {
                  <div
                    class="segment free"
                    [style.width.%]="a.freePercent"
                    [matTooltip]="'Libre : ' + (a.free | money: a.currencyCode)"
                  ></div>
                }
              </div>
              <div class="legend">
                @for (part of a.parts; track part.goal.id) {
                  <span class="legend-item">
                    <span class="dot" [style.background]="part.color"></span>
                    {{ part.goal.name }}
                    <span class="amount">{{ part.goal.savedAmount | money: a.currencyCode }}</span>
                  </span>
                }
                <span class="legend-item">
                  <span class="dot free"></span>
                  Libre
                  <span class="amount">{{ a.free | money: a.currencyCode }}</span>
                </span>
              </div>
              <div class="split-total muted">
                {{ a.allocated | money: a.currencyCode }} dans
                {{
                  a.parts.length > 1 ? a.parts.length + ' budgets spéciaux' : 'un budget spécial'
                }}
                · {{ a.allocatedPercent }} % du solde
              </div>
            </div>
          }
        </div>

        <div class="goals-grid">
          @for (g of shownGoals(); track g.id) {
            <div class="card goal" [class.reached]="g.reached">
              <div class="goal-head">
                <mat-icon class="goal-icon" [style.color]="goalColor(g)">{{
                  g.reached ? 'lock' : 'flag'
                }}</mat-icon>
                <div class="goal-title">
                  <h3>{{ g.name }}</h3>
                  <span class="muted">{{ g.accountName }}</span>
                </div>
                <button
                  matIconButton
                  [matMenuTriggerFor]="goalMenu"
                  [attr.aria-label]="'Actions sur ' + g.name"
                >
                  <mat-icon>more_vert</mat-icon>
                </button>
                <mat-menu #goalMenu>
                  <button mat-menu-item (click)="editGoal(g)">
                    <mat-icon>edit</mat-icon> Modifier
                  </button>
                  <button mat-menu-item (click)="adjustGoal(g)">
                    <mat-icon>swap_vert</mat-icon> Affecter ou rendre libre
                  </button>
                  <button mat-menu-item (click)="useGoal(g)">
                    <mat-icon>shopping_bag</mat-icon> Marquer comme utilisé
                  </button>
                  <button mat-menu-item (click)="deleteGoal(g)">
                    <mat-icon>delete</mat-icon> Supprimer
                  </button>
                </mat-menu>
              </div>
              <div class="goal-amount amount">
                {{ g.savedAmount | money: g.currencyCode }}
                <span class="muted">/ {{ g.targetAmount | money: g.currencyCode }}</span>
              </div>
              <div
                class="goal-bar"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                [attr.aria-valuenow]="goalPercent(g)"
                [attr.aria-label]="g.name + ' : objectif atteint à ' + goalPercent(g) + ' %'"
              >
                <div
                  class="fill"
                  [style.width.%]="goalPercent(g)"
                  [style.background]="goalColor(g)"
                ></div>
              </div>
              <div class="goal-status">
                @if (g.reached) {
                  <mat-icon inline>lock</mat-icon> Objectif atteint : plus d’affectation possible
                } @else {
                  Il manque {{ g.remaining | money: g.currencyCode }}
                }
              </div>
              @if (!g.reached && accountFree(g) > 0) {
                <button matButton="tonal" class="goal-adjust" (click)="adjustGoal(g)">
                  <mat-icon>add</mat-icon> Affecter
                  <span class="muted">· {{ accountFree(g) | money: g.currencyCode }} libres</span>
                </button>
              }
              @if (g.withdrawn > 0) {
                <div
                  class="goal-withdrawn muted"
                  matTooltip="Des retraits ont fait passer le solde du compte sous le total de ses budgets spéciaux"
                >
                  {{ g.withdrawn | money: g.currencyCode }} repris par des retraits
                </div>
              }
            </div>
          }
        </div>
      } @else {
        <p class="muted goals-empty">
          Mettez de l'argent de côté pour un projet (une moto, des vacances…) sur un compte
          d'épargne : à chaque virement vers ce compte, vous choisissez la part qui va au projet.
        </p>
      }

      @if (usedGoals().length) {
        <div class="card used-goals">
          <h2><mat-icon>history</mat-icon> Budgets spéciaux utilisés</h2>
          @for (g of usedGoals(); track g.id) {
            <div class="used-goal">
              <div class="flex">
                <strong>{{ g.name }}</strong>
                <span class="muted">
                  · {{ g.savedAmount | money: g.currencyCode }} sur {{ g.accountName }}, utilisé le
                  {{ g.usedDate | date: 'dd/MM/yyyy' }}
                </span>
              </div>
              <button matButton (click)="restoreGoal(g)">Rétablir</button>
              <button
                matIconButton
                (click)="deleteGoal(g)"
                matTooltip="Supprimer"
                [attr.aria-label]="'Supprimer ' + g.name"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .month-nav {
      display: flex;
      align-items: center;
      gap: 4px;

      .month {
        min-width: 140px;
        text-align: center;
        font: var(--mat-sys-title-medium);
        text-transform: capitalize;
      }
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 28px 0 12px;

      h2 {
        flex: 1;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        font: var(--mat-sys-title-large);
      }
    }
    // Trois cartes par ligne au plus
    .account-filter {
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .accounts-grid.single {
      grid-template-columns: minmax(0, 1fr);
    }
    .accounts-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      margin-bottom: 16px;

      @media (max-width: 900px) {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .account-split {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .split-head {
      display: flex;
      align-items: baseline;
      gap: 8px;

      mat-icon {
        align-self: center;
        color: var(--mat-sys-primary);
      }
      .spacer {
        flex: 1;
      }
    }
    .split-name {
      font: var(--mat-sys-title-medium);
      color: inherit;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }
    .split-balance {
      font: var(--mat-sys-title-medium);
    }
    // Barre empilée : un segment par budget spécial, le reste est libre
    .stack {
      display: flex;
      height: 12px;
      border-radius: 999px;
      overflow: hidden;
      background: var(--mat-sys-surface-container-highest);
    }
    .segment {
      height: 100%;
      min-width: 2px;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
      font: var(--mat-sys-body-small);
    }
    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;

      .amount {
        font-weight: 500;
      }
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;

      &.free {
        background: var(--goal-free);
      }
    }
    // Argent libre : hachures neutres, bien visibles sans ressembler à un budget
    .account-split {
      --goal-free: repeating-linear-gradient(
        135deg,
        color-mix(in srgb, var(--mat-sys-on-surface) 38%, transparent) 0 3px,
        color-mix(in srgb, var(--mat-sys-on-surface) 18%, transparent) 3px 6px
      );
    }
    .segment.free {
      background: var(--goal-free);
    }
    .split-total {
      font: var(--mat-sys-body-small);
    }
    .goals-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;

      @media (max-width: 1100px) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      @media (max-width: 700px) {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .goal {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .goal-head {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .goal-icon {
      margin-top: 2px;
      color: var(--mat-sys-primary);
    }
    .goal-title {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;

      h3 {
        margin: 0;
        font: var(--mat-sys-title-medium);
        overflow-wrap: anywhere;
      }
      .muted {
        font: var(--mat-sys-body-small);
      }
    }
    .goal-amount {
      font: var(--mat-sys-headline-small);
    }
    .goal-bar {
      height: 8px;
      border-radius: 999px;
      background: var(--mat-sys-surface-container-highest);
      overflow: hidden;

      .fill {
        height: 100%;
        border-radius: inherit;
        background: var(--mat-sys-primary);
        transition: width 0.3s ease;
      }
    }
    .goal-status,
    .goal-withdrawn {
      font: var(--mat-sys-body-small);
    }
    .reached .goal-status {
      color: var(--hermes-positive);
    }
    .goal-withdrawn {
      cursor: help;
    }
    .goal-adjust {
      align-self: flex-start;
    }
    .goals-empty {
      margin: 0;
      max-width: 640px;
    }
    .used-goals {
      margin-top: 16px;
    }
    .used-goal {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      border-top: 1px solid var(--hermes-border);

      &:first-of-type {
        border-top: none;
      }
      .flex {
        flex: 1;
        min-width: 0;
      }
    }
    .warning-card {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
      border: none;

      a {
        color: inherit;
        font-weight: 500;
      }
    }
    .kpis {
      margin-bottom: 16px;
    }
    .kpi-bar {
      margin-top: 10px;
    }
    .info {
      font-size: 16px;
      width: 16px;
      height: 16px;
      vertical-align: middle;
      cursor: help;
    }
    .envelope {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 0;
      border-top: 1px solid var(--hermes-border);

      &:first-of-type {
        border-top: none;
      }
    }
    .icon {
      display: grid;
      place-items: center;
      flex: none;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      color: #fff;

      mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
    }
    .body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .line {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .name {
      font: var(--mat-sys-title-small);
      color: inherit;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }
    .spacer {
      flex: 1;
    }
    .figures {
      white-space: nowrap;
    }
    .status {
      font: var(--mat-sys-body-small);
      color: var(--hermes-muted);

      &.near {
        color: var(--hermes-warning);
      }
      &.over {
        color: var(--hermes-negative);
      }
    }
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 8px;
      padding: 40px 24px;

      > mat-icon {
        font-size: 40px;
        width: 40px;
        height: 40px;
        color: var(--mat-sys-primary);
      }
      h2 {
        margin: 0;
      }
      p {
        max-width: 460px;
        margin: 0 0 8px;
      }
    }
  `,
})
export class BudgetComponent {
  private readonly api = inject(BudgetApi);
  private readonly goalApi = inject(GoalApi);
  private readonly store = inject(DataStore);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  protected readonly today = new Date();
  protected readonly month = signal(this.today);
  protected readonly budget = signal<Budget | null>(null);
  private readonly goals = signal<Goal[]>([]);
  protected readonly activeGoals = computed(() => this.goals().filter((g) => !g.usedDate));
  // Compte affiché, null pour tous ; ignoré s'il n'a plus de budget spécial en cours
  protected readonly accountFilter = signal<number | null>(null);
  // Comptes qui portent des budgets spéciaux en cours, avec la part de chacun et le reste libre
  protected readonly goalAccounts = computed<GoalAccount[]>(() => {
    // Une couleur par budget spécial, dans l’ordre de création, tous comptes confondus
    const order = new Map(this.activeGoals().map((goal, index) => [goal.id, index]));
    const byAccount = new Map<number, Goal[]>();
    for (const goal of this.activeGoals()) {
      byAccount.set(goal.accountId, [...(byAccount.get(goal.accountId) ?? []), goal]);
    }
    return [...byAccount.entries()].map(([id, goals]) => {
      const account = this.store.account(id);
      const balance = account?.balance ?? 0;
      const allocated = goals.reduce((sum, g) => sum + g.savedAmount, 0);
      const base = Math.max(balance, allocated, 0);
      return {
        id,
        name: goals[0].accountName,
        currencyCode: goals[0].currencyCode,
        balance,
        allocated,
        free: Math.max(0, balance - allocated),
        freePercent: base > 0 ? (Math.max(0, balance - allocated) / base) * 100 : 0,
        allocatedPercent: balance > 0 ? Math.round((allocated / balance) * 100) : 0,
        parts: goals.map((goal) => ({
          goal,
          color: GOAL_COLORS[(order.get(goal.id) ?? 0) % GOAL_COLORS.length],
          percent: base > 0 ? (goal.savedAmount / base) * 100 : 0,
        })),
      };
    });
  });
  // Couleur de chaque budget spécial, la même dans la barre du compte et sur sa carte
  private readonly goalColors = computed(
    () =>
      new Map(
        this.goalAccounts().flatMap((a) => a.parts.map((p) => [p.goal.id, p.color] as const)),
      ),
  );

  protected goalColor(goal: Goal): string {
    return this.goalColors().get(goal.id) ?? GOAL_COLORS[0];
  }

  private readonly selectedAccount = computed(() => {
    const id = this.accountFilter();
    return this.goalAccounts().some((a) => a.id === id) ? id : null;
  });
  protected readonly shownAccounts = computed(() => {
    const id = this.selectedAccount();
    return this.goalAccounts().filter((a) => id === null || a.id === id);
  });
  protected readonly shownGoals = computed(() => {
    const id = this.selectedAccount();
    return this.activeGoals().filter((g) => id === null || g.accountId === id);
  });

  protected stackLabel(account: GoalAccount): string {
    const parts = account.parts.map(
      (p) => p.goal.name + ' ' + formatMoney(p.goal.savedAmount, account.currencyCode),
    );
    return `${account.name} : ${parts.join(', ')}, libre ${formatMoney(account.free, account.currencyCode)}`;
  }
  // Les plus récemment utilisés d'abord
  protected readonly usedGoals = computed(() =>
    this.goals()
      .filter((g) => g.usedDate)
      .sort((a, b) => b.usedDate!.localeCompare(a.usedDate!)),
  );
  protected readonly isCurrentMonth = computed(() => isSameMonth(this.month(), this.today));
  private readonly monthKey = computed(() => format(this.month(), 'yyyy-MM'));

  protected readonly abs = Math.abs;
  protected readonly level = (e: BudgetEnvelope) => budgetLevel(e.spent, e.amount);

  constructor() {
    effect(() => {
      const month = this.monthKey();
      this.store.version();
      untracked(() => this.load(month));
    });
    effect(() => {
      this.store.version();
      untracked(() => this.loadGoals());
    });
  }

  // ---------- Budgets spéciaux ----------

  protected goalPercent(goal: Goal): number {
    return goal.targetAmount > 0
      ? Math.min(100, Math.round((Math.max(0, goal.savedAmount) / goal.targetAmount) * 100))
      : 0;
  }

  protected createGoal(): void {
    GoalDialogComponent.open(this.dialog)
      .afterClosed()
      .subscribe((changed) => changed && this.loadGoals());
  }

  protected editGoal(goal: Goal): void {
    GoalDialogComponent.open(this.dialog, goal)
      .afterClosed()
      .subscribe((changed) => changed && this.loadGoals());
  }

  // Argent libre du compte du budget : solde moins ses budgets spéciaux
  protected accountFree(goal: Goal): number {
    return this.goalAccounts().find((a) => a.id === goal.accountId)?.free ?? 0;
  }

  protected adjustGoal(goal: Goal): void {
    GoalAdjustDialogComponent.open(this.dialog, { goal, free: this.accountFree(goal) })
      .afterClosed()
      .subscribe((changed) => changed && this.loadGoals());
  }

  protected useGoal(goal: Goal): void {
    GoalUseDialogComponent.open(this.dialog, goal)
      .afterClosed()
      .subscribe((changed) => changed && this.loadGoals());
  }

  protected restoreGoal(goal: Goal): void {
    this.goalApi.restore(goal.id).subscribe({
      next: () => {
        this.notify.success(`${goal.name} est de nouveau en cours`);
        this.loadGoals();
      },
      error: (error) => this.notify.error(error),
    });
  }

  protected deleteGoal(goal: Goal): void {
    confirm(this.dialog, {
      title: 'Supprimer le budget spécial',
      message: `« ${goal.name} » sera supprimé avec ses affectations. L'argent reste sur ${goal.accountName}.`,
      confirmLabel: 'Supprimer',
      danger: true,
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.goalApi.delete(goal.id).subscribe({
        next: () => {
          this.notify.success('Budget spécial supprimé');
          this.loadGoals();
        },
        error: (error) => this.notify.error(error),
      });
    });
  }

  private loadGoals(): void {
    this.goalApi.list().subscribe({
      next: (goals) => this.goals.set(goals),
      error: (error) => this.notify.error(error),
    });
  }

  protected shift(months: number): void {
    this.month.update((month) => addMonths(month, months));
  }

  protected create(): void {
    this.openDialog();
  }

  protected edit(envelope: BudgetEnvelope): void {
    this.openDialog(envelope);
  }

  protected color(e: BudgetEnvelope): string {
    return this.store.categoryOption(e.category.id)?.color ?? e.category.color ?? '#9e9e9e';
  }

  protected icon(e: BudgetEnvelope): string {
    return this.store.categoryOption(e.category.id)?.icon ?? e.category.icon ?? 'sell';
  }

  // Dépenses du mois de la catégorie (sous-catégories comprises)
  protected transactionsLink(e: BudgetEnvelope): Record<string, string | number> {
    return {
      categoryId: e.category.id,
      kind: 'EXPENSE',
      from: toIsoDate(new Date(this.month().getFullYear(), this.month().getMonth(), 1))!,
      to: toIsoDate(endOfMonth(this.month()))!,
    };
  }

  private openDialog(envelope?: BudgetEnvelope): void {
    EnvelopeDialogComponent.open(this.dialog, {
      month: this.monthKey(),
      currencyCode: this.budget()?.currencyCode ?? this.store.referenceCurrency(),
      envelope,
    })
      .afterClosed()
      .subscribe((changed) => changed && this.load(this.monthKey()));
  }

  private load(month: string): void {
    this.api.month(month).subscribe({
      next: (budget) => {
        // Une réponse tardive d'un autre mois est ignorée
        if (budget.month === this.monthKey()) {
          this.budget.set(budget);
        }
      },
      error: (error) => this.notify.error(error),
    });
  }
}
