import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { CategoryApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { Category } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DIALOG_SMALL } from '../../shared/confirm-dialog.component';
import { DialogCloseComponent } from '../../shared/dialog-close.component';

@Component({
  selector: 'app-category-delete-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    DialogCloseComponent,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Supprimer « {{ category.name }} »</h2>
    <mat-dialog-content>
      @if (hasChildren()) {
        <p>Ses sous-catégories seront remontées d'un niveau.</p>
      }
      <p>Que faire des opérations de cette catégorie ?</p>
      <mat-form-field>
        <mat-label>Déplacer les opérations vers</mat-label>
        <mat-select [(ngModel)]="replacementId">
          <mat-option [value]="null">— Les laisser non catégorisées —</mat-option>
          @for (option of options(); track option.category.id) {
            <mat-option [value]="option.category.id">
              <span [style.padding-left.px]="option.depth * 16">{{ option.category.name }}</span>
            </mat-option>
          }
        </mat-select>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Annuler</button>
      <button
        matButton="filled"
        (click)="delete()"
        [disabled]="saving()"
        style="--mat-button-filled-container-color: var(--mat-sys-error)"
      >
        Supprimer
      </button>
    </mat-dialog-actions>
    <app-dialog-close />
  `,
})
export class CategoryDeleteDialogComponent {
  static open(
    dialog: MatDialog,
    category: Category,
  ): MatDialogRef<CategoryDeleteDialogComponent, boolean> {
    return dialog.open(CategoryDeleteDialogComponent, { data: category, width: DIALOG_SMALL });
  }

  protected readonly category = inject<Category>(MAT_DIALOG_DATA);
  private readonly store = inject(DataStore);
  private readonly api = inject(CategoryApi);
  private readonly notify = inject(NotifyService);
  private readonly dialogRef = inject(MatDialogRef<CategoryDeleteDialogComponent, boolean>);

  protected replacementId: number | null = this.category.parentId;
  protected readonly saving = signal(false);
  protected readonly hasChildren = computed(() =>
    this.store.categories().some((c) => c.parentId === this.category.id),
  );
  protected readonly options = computed(() =>
    this.store
      .categoryOptions(this.category.type)
      .filter((o) => o.category.id !== this.category.id),
  );

  protected delete(): void {
    this.saving.set(true);
    this.api.delete(this.category.id, this.replacementId).subscribe({
      next: () => {
        this.notify.success('Catégorie supprimée');
        this.store.reloadCategories();
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
