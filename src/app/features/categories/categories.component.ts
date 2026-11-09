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
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { CategoryOption, DataStore } from '../../core/data.store';
import { Category, CategoryType } from '../../core/models';
import { CategoryDeleteDialogComponent } from './category-delete-dialog.component';
import { CategoryDialogComponent } from './category-dialog.component';

const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

@Component({
  selector: 'app-categories',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatTooltipModule,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Catégories</h1>
          <div class="subtitle">
            Une liste standard est fournie : renommez, ajoutez ou supprimez des catégories selon vos
            habitudes.
          </div>
        </div>
        <button matButton="filled" (click)="create(null)">
          <mat-icon>add</mat-icon> Nouvelle catégorie
        </button>
      </div>

      <div class="card">
        <div class="toolbar">
          <mat-button-toggle-group
            [value]="type()"
            (change)="type.set($event.value)"
            hideSingleSelectionIndicator
          >
            <mat-button-toggle value="EXPENSE">Dépenses</mat-button-toggle>
            <mat-button-toggle value="INCOME">Revenus</mat-button-toggle>
          </mat-button-toggle-group>
          <mat-form-field class="search">
            <mat-icon matPrefix>search</mat-icon>
            <input
              matInput
              placeholder="Rechercher une catégorie"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
            />
          </mat-form-field>
          <span class="spacer"></span>
          @if (!query()) {
            @if (allExpanded()) {
              <button matButton (click)="collapseAll()">
                <mat-icon>unfold_less</mat-icon> Tout replier
              </button>
            } @else {
              <button matButton (click)="expandAll()">
                <mat-icon>unfold_more</mat-icon> Tout déplier
              </button>
            }
          }
        </div>

        @for (option of visible(); track option.category.id) {
          <div
            class="node"
            [style.padding-left.px]="12 + option.depth * 32"
            [class.root]="option.depth === 0"
          >
            @if (hasChildren(option.category.id) && !query()) {
              <button
                matIconButton
                class="toggle"
                (click)="toggle(option.category.id)"
                [attr.aria-label]="isCollapsed(option.category.id) ? 'Déplier' : 'Replier'"
              >
                <mat-icon>{{
                  isCollapsed(option.category.id) ? 'chevron_right' : 'expand_more'
                }}</mat-icon>
              </button>
            } @else {
              <span class="toggle-placeholder"></span>
            }
            <!-- Une sous-catégorie sans icône propre n'affiche qu'un point à la couleur héritée -->
            @if (option.depth > 0 && !option.category.icon) {
              <span class="dot-slot">
                <span class="category-dot" [style.background]="option.color ?? '#9e9e9e'"></span>
              </span>
            } @else {
              <span class="icon" [style.background]="option.color ?? '#9e9e9e'">
                <mat-icon>{{ option.icon ?? 'sell' }}</mat-icon>
              </span>
            }
            <!-- Raccourci à la souris : au clavier, le bouton de dépliage ci-dessus fait la même chose -->
            <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
            <span class="name" (click)="toggleIfParent(option.category.id)">
              @if (query() && option.depth > 0) {
                <span class="muted">{{ parentPath(option) }} › </span>
              }
              {{ option.category.name }}
              @if (isCollapsed(option.category.id) && !query()) {
                <span class="muted count"
                  >{{ childCount(option.category.id) }} sous-catégories</span
                >
              }
            </span>
            <span class="actions">
              <a
                matIconButton
                matTooltip="Voir les opérations"
                [attr.aria-label]="'Voir les opérations de ' + option.category.name"
                routerLink="/transactions"
                [queryParams]="{ categoryId: option.category.id }"
              >
                <mat-icon>receipt_long</mat-icon>
              </a>
              <button
                matIconButton
                matTooltip="Ajouter une sous-catégorie"
                [attr.aria-label]="'Ajouter une sous-catégorie à ' + option.category.name"
                (click)="create(option.category)"
              >
                <mat-icon>add</mat-icon>
              </button>
              <button
                matIconButton
                matTooltip="Modifier"
                [attr.aria-label]="'Modifier ' + option.category.name"
                (click)="edit(option.category)"
              >
                <mat-icon>edit</mat-icon>
              </button>
              <button
                matIconButton
                matTooltip="Supprimer"
                [attr.aria-label]="'Supprimer ' + option.category.name"
                (click)="remove(option.category)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </span>
          </div>
        } @empty {
          <div class="empty">
            <p>
              {{
                query() ? 'Aucune catégorie ne correspond à votre recherche' : 'Aucune catégorie'
              }}
            </p>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .toolbar {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 16px;
      .search {
        width: 280px;
      }
    }
    .node {
      display: flex;
      align-items: center;
      gap: 10px;
      padding-top: 2px;
      padding-bottom: 2px;
      border-radius: 12px;
      &:hover {
        background: var(--mat-sys-surface-container);
        .actions {
          opacity: 1;
        }
      }
      &:focus-within .actions {
        opacity: 1;
      }
      &.root {
        margin-top: 4px;
        .name {
          font-weight: 500;
          cursor: pointer;
        }
      }
    }
    .toggle-placeholder {
      width: 40px;
    }
    .dot-slot {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      flex-shrink: 0;
    }
    .icon {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: white;
      flex-shrink: 0;
      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }
    .name {
      flex: 1;
    }
    .count {
      font-weight: 400;
      font-size: 13px;
      margin-left: 8px;
    }
    // Les actions n'apparaissent que sur la ligne visée, ou en permanence sur un écran tactile
    .actions {
      opacity: 0;
      transition: opacity 0.15s;
      white-space: nowrap;
    }
    @media (hover: none) {
      .actions {
        opacity: 1;
      }
    }
  `,
})
export class CategoriesComponent {
  protected readonly store = inject(DataStore);
  private readonly dialog = inject(MatDialog);

  protected readonly type = signal<CategoryType>('EXPENSE');
  protected readonly query = signal('');
  // Les catégories principales sont repliées au départ pour une vue d'ensemble lisible
  protected readonly collapsed = signal(new Set<number>());
  private initialized = false;

  private readonly childCounts = computed(() => {
    const counts = new Map<number, number>();
    for (const c of this.store.categories()) {
      if (c.parentId !== null) {
        counts.set(c.parentId, (counts.get(c.parentId) ?? 0) + 1);
      }
    }
    return counts;
  });

  protected readonly allExpanded = computed(() => this.collapsed().size === 0);

  protected readonly visible = computed<CategoryOption[]>(() => {
    const options = this.store.categoryOptions(this.type());
    const q = normalize(this.query().trim());
    if (q) {
      return options.filter((o) => normalize(o.path).includes(q));
    }
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
    return options.filter((o) => !isHidden(o.category));
  });

  constructor() {
    effect(() => {
      const counts = this.childCounts();
      if (!this.initialized && counts.size > 0) {
        this.initialized = true;
        untracked(() => this.collapsed.set(new Set(counts.keys())));
      }
    });
  }

  protected hasChildren(id: number): boolean {
    return this.childCounts().has(id);
  }

  protected childCount(id: number): number {
    return this.childCounts().get(id) ?? 0;
  }

  protected isCollapsed(id: number): boolean {
    return this.collapsed().has(id);
  }

  protected parentPath(option: CategoryOption): string {
    return option.path.slice(0, option.path.lastIndexOf(' › '));
  }

  protected toggleIfParent(id: number): void {
    if (this.hasChildren(id)) {
      this.toggle(id);
    }
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

  protected expandAll(): void {
    this.collapsed.set(new Set());
  }

  protected collapseAll(): void {
    this.collapsed.set(new Set(this.childCounts().keys()));
  }

  protected create(parent: Category | null): void {
    CategoryDialogComponent.open(this.dialog, {
      parentId: parent?.id ?? null,
      type: parent?.type ?? this.type(),
    })
      .afterClosed()
      .subscribe((created) => {
        // La nouvelle sous-catégorie doit être visible : on déplie son parent
        if (created && parent && this.isCollapsed(parent.id)) {
          this.toggle(parent.id);
        }
      });
  }

  protected edit(category: Category): void {
    CategoryDialogComponent.open(this.dialog, { category });
  }

  protected remove(category: Category): void {
    CategoryDeleteDialogComponent.open(this.dialog, category);
  }
}
