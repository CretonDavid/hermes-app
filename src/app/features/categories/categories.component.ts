import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { CategoryOption, DataStore } from '../../core/data.store';
import { Category, CategoryType } from '../../core/models';
import { CategoryDeleteDialogComponent } from './category-delete-dialog.component';
import { CategoryDialogComponent } from './category-dialog.component';

@Component({
  selector: 'app-categories',
  imports: [MatButtonModule, MatButtonToggleModule, MatIconModule, MatTooltipModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Catégories</h1>
          <div class="subtitle">Organisez vos dépenses et revenus sur plusieurs niveaux</div>
        </div>
        <mat-button-toggle-group [value]="type()" (change)="type.set($event.value)" hideSingleSelectionIndicator>
          <mat-button-toggle value="EXPENSE">Dépenses</mat-button-toggle>
          <mat-button-toggle value="INCOME">Revenus</mat-button-toggle>
        </mat-button-toggle-group>
        <button matButton="filled" (click)="create(null)"><mat-icon>add</mat-icon> Nouvelle catégorie</button>
      </div>

      <div class="card">
        @for (option of visible(); track option.category.id) {
          <div class="node" [style.padding-left.px]="12 + option.depth * 32" [class.root]="option.depth === 0">
            @if (hasChildren(option.category.id)) {
              <button matIconButton class="toggle" (click)="toggle(option.category.id)">
                <mat-icon>{{ collapsed().has(option.category.id) ? 'chevron_right' : 'expand_more' }}</mat-icon>
              </button>
            } @else {
              <span class="toggle-placeholder"></span>
            }
            <span class="icon" [style.background]="option.color ?? '#9e9e9e'">
              <mat-icon>{{ option.icon ?? 'sell' }}</mat-icon>
            </span>
            <span class="name">{{ option.category.name }}</span>
            <span class="actions">
              <a matIconButton matTooltip="Voir les opérations" routerLink="/transactions" [queryParams]="{ categoryId: option.category.id }">
                <mat-icon>receipt_long</mat-icon>
              </a>
              <button matIconButton matTooltip="Ajouter une sous-catégorie" (click)="create(option.category)">
                <mat-icon>add</mat-icon>
              </button>
              <button matIconButton matTooltip="Modifier" (click)="edit(option.category)"><mat-icon>edit</mat-icon></button>
              <button matIconButton matTooltip="Supprimer" (click)="remove(option.category)"><mat-icon>delete</mat-icon></button>
            </span>
          </div>
        } @empty {
          <div class="empty"><p>Aucune catégorie</p></div>
        }
      </div>
    </div>
  `,
  styles: `
    .node {
      display: flex;
      align-items: center;
      gap: 10px;
      padding-top: 4px;
      padding-bottom: 4px;
      border-radius: 12px;
      &:hover {
        background: var(--mat-sys-surface-container);
        .actions {
          opacity: 1;
        }
      }
      &.root {
        margin-top: 8px;
        .name {
          font-weight: 500;
        }
      }
    }
    .toggle-placeholder {
      width: 40px;
    }
    .icon {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: white;
      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }
    .name {
      flex: 1;
    }
    .actions {
      opacity: 0;
      transition: opacity 0.15s;
    }
  `,
})
export class CategoriesComponent {
  protected readonly store = inject(DataStore);
  private readonly dialog = inject(MatDialog);

  protected readonly type = signal<CategoryType>('EXPENSE');
  protected readonly collapsed = signal(new Set<number>());

  private readonly parents = computed(
    () => new Set(this.store.categories().filter((c) => c.parentId !== null).map((c) => c.parentId!)),
  );

  // Arbre filtré par type, en masquant les descendants des noeuds repliés
  protected readonly visible = computed<CategoryOption[]>(() => {
    const collapsed = this.collapsed();
    const byId = this.store.categoriesById();
    const isHidden = (category: Category): boolean => {
      let parentId = category.parentId;
      while (parentId !== null) {
        if (collapsed.has(parentId)) {
          return true;
        }
        parentId = byId.get(parentId)?.parentId ?? null;
      }
      return false;
    };
    return this.store.categoryOptions(this.type()).filter((o) => !isHidden(o.category));
  });

  protected hasChildren(id: number): boolean {
    return this.parents().has(id);
  }

  protected toggle(id: number): void {
    const next = new Set(this.collapsed());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.collapsed.set(next);
  }

  protected create(parent: Category | null): void {
    CategoryDialogComponent.open(this.dialog, { parentId: parent?.id ?? null, type: parent?.type ?? this.type() });
  }

  protected edit(category: Category): void {
    CategoryDialogComponent.open(this.dialog, { category });
  }

  protected remove(category: Category): void {
    CategoryDeleteDialogComponent.open(this.dialog, category);
  }
}
