import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ImportApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { CsvImportOptions, CsvInspection, ImportPreview, ImportRow } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { MoneyPipe } from '../../shared/money.pipe';
import { NoAccountComponent } from '../../shared/no-account.component';

type Step = 'file' | 'mapping' | 'preview' | 'done';

interface PreviewRow extends ImportRow {
  selected: boolean;
}

const MAPPING_KEY = 'hermes.csv-mapping.';

const DATE_FORMATS = [
  'dd/MM/yyyy',
  'dd/MM/yy',
  'yyyy-MM-dd',
  'dd-MM-yyyy',
  'dd.MM.yyyy',
  'MM/dd/yyyy',
];

@Component({
  selector: 'app-import',
  imports: [
    FormsModule,
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTooltipModule,
    MoneyPipe,
    NoAccountComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './import.component.html',
  styleUrl: './import.component.scss',
})
export class ImportComponent {
  protected readonly store = inject(DataStore);
  private readonly api = inject(ImportApi);
  private readonly notify = inject(NotifyService);

  protected readonly dateFormats = DATE_FORMATS;
  protected readonly step = signal<Step>('file');
  protected readonly loading = signal(false);
  protected readonly accountId = signal<number | null>(null);
  protected readonly file = signal<File | null>(null);
  protected readonly inspection = signal<CsvInspection | null>(null);
  protected readonly preview = signal<ImportPreview | null>(null);
  protected readonly rows = signal<PreviewRow[]>([]);
  protected readonly imported = signal(0);
  protected readonly actionsVisible = signal(true);

  private readonly previewActions = viewChild<ElementRef<HTMLElement>>('previewActions');

  // Mapping CSV
  protected options: CsvImportOptions = this.defaultOptions();
  protected amountMode: 'single' | 'split' = 'single';

  protected readonly isOfx = computed(() => /\.(ofx|qfx)$/i.test(this.file()?.name ?? ''));
  protected readonly account = computed(() => this.store.account(this.accountId()));
  protected readonly columns = computed(() =>
    Array.from({ length: this.inspection()?.columnCount ?? 0 }, (_, i) => i),
  );
  protected readonly selectedCount = computed(() => this.rows().filter((r) => r.selected).length);
  protected readonly selectedTotal = computed(() =>
    this.rows()
      .filter((r) => r.selected)
      .reduce((sum, r) => sum + (r.direction === 'DEBIT' ? -r.amount : r.amount), 0),
  );
  protected readonly duplicateCount = computed(() => this.rows().filter((r) => r.duplicate).length);

  constructor() {
    const accountId = inject(ActivatedRoute).snapshot.queryParamMap.get('accountId');
    if (accountId) {
      this.accountId.set(Number(accountId));
    }
    // Un seul compte : il est présélectionné
    effect(() => {
      const accounts = this.store.openAccounts();
      if (accounts.length === 1 && untracked(() => this.accountId()) === null) {
        this.accountId.set(accounts[0].id);
      }
    });
    // La flèche vers les boutons d'import ne s'affiche que s'ils sont hors de l'écran
    effect((onCleanup) => {
      const actions = this.previewActions()?.nativeElement;
      if (!actions) {
        return;
      }
      const observer = new IntersectionObserver(([entry]) =>
        this.actionsVisible.set(entry.isIntersecting),
      );
      observer.observe(actions);
      onCleanup(() => observer.disconnect());
    });
  }

  protected goToActions(): void {
    this.previewActions()?.nativeElement.scrollIntoView({ block: 'end' });
  }

  protected selectFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file.set(input.files?.[0] ?? null);
  }

  protected drop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.file.set(file);
    }
  }

  protected next(): void {
    const file = this.file();
    const accountId = this.accountId();
    if (!file || !accountId) {
      return;
    }
    this.loading.set(true);
    if (this.isOfx()) {
      this.api.previewOfx(file, accountId).subscribe({
        next: (preview) => this.showPreview(preview),
        error: (error) => this.fail(error),
      });
      return;
    }
    this.api.inspectCsv(file).subscribe({
      next: (inspection) => {
        this.loading.set(false);
        this.inspection.set(inspection);
        this.restoreOrGuessMapping(inspection);
        this.step.set('mapping');
      },
      error: (error) => this.fail(error),
    });
  }

  protected previewCsv(): void {
    const options: CsvImportOptions = {
      ...this.options,
      separator: this.inspection()?.separator,
      encoding: this.inspection()?.encoding,
      amountColumn: this.amountMode === 'single' ? this.options.amountColumn : null,
      debitColumn: this.amountMode === 'split' ? this.options.debitColumn : null,
      creditColumn: this.amountMode === 'split' ? this.options.creditColumn : null,
    };
    if (!options.labelColumns.length) {
      this.notify.error('Choisissez au moins une colonne de libellé');
      return;
    }
    localStorage.setItem(
      MAPPING_KEY + this.accountId(),
      JSON.stringify({ options, amountMode: this.amountMode }),
    );
    this.loading.set(true);
    this.api.previewCsv(this.file()!, this.accountId()!, options).subscribe({
      next: (preview) => this.showPreview(preview),
      error: (error) => this.fail(error),
    });
  }

  protected toggleAll(selected: boolean): void {
    this.rows.update((rows) => rows.map((r) => ({ ...r, selected })));
  }

  protected toggleRow(row: PreviewRow, selected: boolean): void {
    this.rows.update((rows) => rows.map((r) => (r === row ? { ...r, selected } : r)));
  }

  protected setCategory(row: PreviewRow, categoryId: number | null): void {
    this.rows.update((rows) => rows.map((r) => (r === row ? { ...r, categoryId } : r)));
  }

  protected confirm(): void {
    const rows = this.rows()
      .filter((r) => r.selected)
      .map(({ selected: _selected, ...row }) => row);
    if (rows.length === 0) {
      return;
    }
    this.loading.set(true);
    this.api.confirm(this.accountId()!, rows).subscribe({
      next: (result) => {
        this.loading.set(false);
        this.imported.set(result.imported);
        this.store.transactionsChanged();
        this.step.set('done');
      },
      error: (error) => this.fail(error),
    });
  }

  protected restart(): void {
    this.file.set(null);
    this.inspection.set(null);
    this.preview.set(null);
    this.rows.set([]);
    this.step.set('file');
  }

  protected columnLabel(index: number): string {
    const inspection = this.inspection();
    const header = this.options.hasHeader
      ? inspection?.rows[this.options.skipLines]?.[index]
      : null;
    return header ? `${index + 1} · ${header}` : `Colonne ${index + 1}`;
  }

  protected isDataRow(index: number): boolean {
    return index >= this.options.skipLines + (this.options.hasHeader ? 1 : 0);
  }

  private showPreview(preview: ImportPreview): void {
    this.loading.set(false);
    this.preview.set(preview);
    this.rows.set(preview.rows.map((r) => ({ ...r, selected: !r.duplicate })));
    this.step.set('preview');
  }

  private fail(error: unknown): void {
    this.loading.set(false);
    this.notify.error(error);
  }

  private defaultOptions(): CsvImportOptions {
    return {
      skipLines: 0,
      hasHeader: true,
      dateColumn: 0,
      dateFormat: 'dd/MM/yyyy',
      valueDateColumn: null,
      labelColumns: [1],
      payeeColumn: null,
      amountColumn: 2,
      debitColumn: null,
      creditColumn: null,
      decimalSeparator: '',
      negateAmounts: false,
    };
  }

  /**
   * Reprend le dernier mapping utilisé pour ce compte, sinon le devine à partir des en-têtes.
   */
  private restoreOrGuessMapping(inspection: CsvInspection): void {
    const saved = localStorage.getItem(MAPPING_KEY + this.accountId());
    if (saved) {
      const { options, amountMode } = JSON.parse(saved);
      this.options = { ...this.defaultOptions(), ...options };
      this.amountMode = amountMode;
      return;
    }

    this.options = this.defaultOptions();
    // La ligne d'en-tête est la première qui contient « date »
    const headerIndex = inspection.rows.findIndex((row) => row.some((cell) => /date/i.test(cell)));
    if (headerIndex < 0) {
      this.options.hasHeader = false;
      return;
    }
    this.options.skipLines = headerIndex;
    const header = inspection.rows[headerIndex].map((h) => h.toLowerCase());
    const find = (pattern: RegExp) => header.findIndex((h) => pattern.test(h));

    const date = find(/date( d.op[ée]ration)?$|^date/);
    const valueDate = find(/valeur/);
    const label = find(/libell|description|intitul|label/);
    const amount = find(/montant|amount|somme/);
    const debit = find(/d[ée]bit/);
    const credit = find(/cr[ée]dit/);

    if (date >= 0) {
      this.options.dateColumn = date;
    }
    if (valueDate >= 0 && valueDate !== date) {
      this.options.valueDateColumn = valueDate;
    }
    if (label >= 0) {
      this.options.labelColumns = [label];
    }
    if (debit >= 0 && credit >= 0) {
      this.amountMode = 'split';
      this.options.debitColumn = debit;
      this.options.creditColumn = credit;
      this.options.amountColumn = null;
    } else if (amount >= 0) {
      this.amountMode = 'single';
      this.options.amountColumn = amount;
    }
  }
}
