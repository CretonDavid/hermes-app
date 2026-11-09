import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { TransactionApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { countLabel, pluralize } from '../../core/format';
import { NotifyService } from '../../core/notify.service';
import { CategoryPickerComponent } from '../../shared/category-picker.component';
import { DIALOG_SMALL } from '../../shared/confirm-dialog.component';
import { DialogCloseComponent } from '../../shared/dialog-close.component';

/**
 * Applique une même catégorie à plusieurs opérations sélectionnées.
 */
@Component({
  selector: 'app-bulk-category-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    DialogCloseComponent,
    CategoryPickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Catégoriser {{ ids.length }} opération{{ ids.length > 1 ? 's' : '' }}</h2>
    <mat-dialog-content>
      <div style="padding-top: 8px">
        <app-category-picker [formControl]="category" label="Catégorie" />
      </div>
      <p class="muted" style="font: var(--mat-sys-body-small); margin: 8px 0 0">
        Sans catégorie choisie, les opérations deviennent non catégorisées. Les virements internes
        sont ignorés.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Annuler</button>
      <button matButton="filled" (click)="save()" [disabled]="saving()">Appliquer</button>
    </mat-dialog-actions>
    <app-dialog-close />
  `,
})
export class BulkCategoryDialogComponent {
  static open(
    dialog: MatDialog,
    ids: number[],
  ): MatDialogRef<BulkCategoryDialogComponent, boolean> {
    return dialog.open(BulkCategoryDialogComponent, { data: ids, width: DIALOG_SMALL });
  }

  protected readonly ids = inject<number[]>(MAT_DIALOG_DATA);
  private readonly api = inject(TransactionApi);
  private readonly store = inject(DataStore);
  private readonly notify = inject(NotifyService);
  private readonly dialogRef = inject(MatDialogRef<BulkCategoryDialogComponent, boolean>);

  protected readonly category = new FormControl<number | null>(null);
  protected readonly saving = signal(false);

  protected save(): void {
    this.saving.set(true);
    this.api.updateCategory(this.ids, this.category.value).subscribe({
      next: ({ updated, skippedTransfers }) => {
        const skipped = skippedTransfers
          ? ` (${countLabel(skippedTransfers, 'virement')} ${pluralize(skippedTransfers, 'ignoré')})`
          : '';
        this.notify.success(
          `${countLabel(updated, 'opération')} ${pluralize(updated, 'catégorisée')}${skipped}`,
        );
        this.store.transactionsChanged();
        this.dialogRef.close(true);
      },
      error: (error) => {
        this.saving.set(false);
        this.notify.error(error);
      },
    });
  }
}
