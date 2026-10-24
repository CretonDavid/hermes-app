import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { CategoryApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { Category, CategoryRequest, CategoryType } from '../../core/models';
import { NotifyService } from '../../core/notify.service';

export interface CategoryDialogData {
  category?: Category;
  parentId?: number | null;
  type?: CategoryType;
}

const ICONS = [
  'restaurant',
  'shopping_cart',
  'home',
  'directions_car',
  'train',
  'flight',
  'favorite',
  'local_hospital',
  'wifi',
  'smartphone',
  'sports_esports',
  'fitness_center',
  'theaters',
  'shopping_bag',
  'checkroom',
  'school',
  'child_care',
  'pets',
  'account_balance',
  'credit_card',
  'savings',
  'work',
  'payments',
  'redeem',
  'volunteer_activism',
  'local_gas_station',
  'local_cafe',
  'celebration',
  'build',
  'bolt',
  'water_drop',
  'category',
];

@Component({
  selector: 'app-category-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.category ? 'Modifier la catégorie' : 'Nouvelle catégorie' }}</h2>
    <mat-dialog-content>
      <form class="form-grid" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field class="full">
          <mat-label>Nom</mat-label>
          <input matInput formControlName="name" />
          <mat-error>Nom obligatoire</mat-error>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Catégorie parente</mat-label>
          <mat-select formControlName="parentId">
            <mat-option [value]="null">— Aucune (catégorie principale) —</mat-option>
            @for (option of parents(); track option.category.id) {
              <mat-option [value]="option.category.id">
                <span [style.padding-left.px]="option.depth * 16">{{ option.category.name }}</span>
              </mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Type</mat-label>
          <mat-select formControlName="type">
            <mat-option value="EXPENSE">Dépense</mat-option>
            <mat-option value="INCOME">Revenu</mat-option>
          </mat-select>
          @if (parentId()) {
            <mat-hint>Hérité de la catégorie parente</mat-hint>
          }
        </mat-form-field>

        <div class="color-field">
          <label>Couleur</label>
          <input type="color" formControlName="color" />
          @if (parentId()) {
            <button matButton type="button" (click)="form.controls.color.setValue(null)">
              Hériter du parent
            </button>
          }
        </div>

        <mat-form-field>
          <mat-label>Icône</mat-label>
          <mat-select formControlName="icon">
            <mat-select-trigger>
              <span class="icon-option"
                ><mat-icon>{{ form.controls.icon.value }}</mat-icon>
                {{ form.controls.icon.value }}</span
              >
            </mat-select-trigger>
            <mat-option [value]="null">— Aucune —</mat-option>
            @for (icon of icons; track icon) {
              <mat-option [value]="icon"
                ><span class="icon-option"
                  ><mat-icon>{{ icon }}</mat-icon> {{ icon }}</span
                ></mat-option
              >
            }
          </mat-select>
        </mat-form-field>
        <button type="submit" hidden></button>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Annuler</button>
      <button matButton="filled" (click)="save()" [disabled]="saving()">Enregistrer</button>
    </mat-dialog-actions>
  `,
  styles: `
    .color-field {
      display: flex;
      align-items: center;
      gap: 12px;
      label {
        color: var(--hermes-muted);
      }
      input[type='color'] {
        width: 48px;
        height: 36px;
        border: none;
        background: none;
        cursor: pointer;
      }
    }
    .icon-option {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
  `,
})
export class CategoryDialogComponent {
  static open(
    dialog: MatDialog,
    data: CategoryDialogData,
  ): MatDialogRef<CategoryDialogComponent, Category> {
    return dialog.open(CategoryDialogComponent, { data, width: '560px' });
  }

  protected readonly data = inject<CategoryDialogData>(MAT_DIALOG_DATA);
  private readonly store = inject(DataStore);
  private readonly api = inject(CategoryApi);
  private readonly notify = inject(NotifyService);
  private readonly dialogRef = inject(MatDialogRef<CategoryDialogComponent, Category>);

  protected readonly icons = ICONS;
  protected readonly saving = signal(false);
  private readonly category = this.data.category;

  protected readonly form = new FormGroup({
    name: new FormControl(this.category?.name ?? '', {
      nonNullable: true,
      validators: Validators.required,
    }),
    parentId: new FormControl<number | null>(
      this.category ? this.category.parentId : (this.data.parentId ?? null),
    ),
    type: new FormControl<CategoryType>(this.category?.type ?? this.data.type ?? 'EXPENSE', {
      nonNullable: true,
    }),
    color: new FormControl<string | null>(
      this.category ? this.category.color : this.data.parentId ? null : '#5c6bc0',
    ),
    icon: new FormControl<string | null>(this.category?.icon ?? null),
  });

  protected readonly parentId = toSignal(this.form.controls.parentId.valueChanges, {
    initialValue: this.form.controls.parentId.value,
  });

  // Une catégorie ne peut pas être rangée sous elle-même ni sous l'une de ses sous-catégories
  protected readonly parents = computed(() => {
    const id = this.category?.id;
    if (!id) {
      return this.store.categoryTree();
    }
    const excluded = new Set<number>([id]);
    let added = true;
    while (added) {
      added = false;
      for (const c of this.store.categories()) {
        if (c.parentId !== null && excluded.has(c.parentId) && !excluded.has(c.id)) {
          excluded.add(c.id);
          added = true;
        }
      }
    }
    return this.store.categoryTree().filter((o) => !excluded.has(o.category.id));
  });

  constructor() {
    this.syncType(this.form.controls.parentId.value);
    this.form.controls.parentId.valueChanges.subscribe((parentId) => this.syncType(parentId));
  }

  private syncType(parentId: number | null): void {
    const parent = parentId ? this.store.categoriesById().get(parentId) : null;
    if (parent) {
      this.form.controls.type.setValue(parent.type);
      this.form.controls.type.disable({ emitEvent: false });
    } else {
      this.form.controls.type.enable({ emitEvent: false });
    }
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const request: CategoryRequest = {
      name: v.name.trim(),
      type: v.type,
      parentId: v.parentId,
      color: v.color,
      icon: v.icon,
    };
    this.saving.set(true);
    const request$ = this.category
      ? this.api.update(this.category.id, request)
      : this.api.create(request);
    request$.subscribe({
      next: (category) => {
        this.store.reloadCategories();
        this.dialogRef.close(category);
      },
      error: (error) => {
        this.saving.set(false);
        this.notify.error(error);
      },
    });
  }
}
