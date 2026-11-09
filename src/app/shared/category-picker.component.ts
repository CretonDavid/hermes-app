import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { CategoryOption, DataStore } from '../core/data.store';
import { CategoryType } from '../core/models';

const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Choix d'une catégorie avec recherche : on tape quelques lettres (« rest », « loyer »…) et
 * la liste se filtre sur le nom complet (« Alimentation › Restaurants »).
 */
@Component({
  selector: 'app-category-picker',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatIconModule,
    MatButtonModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CategoryPickerComponent),
      multi: true,
    },
  ],
  template: `
    <mat-form-field>
      <mat-label>{{ label() }}</mat-label>
      @if (selected(); as s) {
        <span matIconPrefix class="dot-prefix"
          ><span class="category-dot" [style.background]="s.color ?? '#9e9e9e'"></span
        ></span>
      }
      <input
        matInput
        [value]="displayText()"
        [title]="selected()?.path ?? ''"
        (input)="onInput($any($event.target).value)"
        (focus)="onFocus($any($event.target))"
        (blur)="onBlur()"
        [matAutocomplete]="auto"
        [disabled]="disabled()"
        [placeholder]="placeholder()"
      />
      @if (value() !== null && !disabled()) {
        <button
          matIconButton
          matIconSuffix
          type="button"
          (click)="clear()"
          aria-label="Retirer la catégorie"
        >
          <mat-icon>close</mat-icon>
        </button>
      }
      <mat-autocomplete
        #auto="matAutocomplete"
        panelWidth="380px"
        [displayWith]="displayWith"
        (optionSelected)="select($event)"
        [hideSingleSelectionIndicator]="true"
      >
        @for (option of filtered(); track option.category.id) {
          <mat-option [value]="option.category.id">
            <span class="option" [style.padding-left.px]="searching() ? 0 : option.depth * 18">
              <span class="category-dot" [style.background]="option.color ?? '#9e9e9e'"></span>
              @if (searching() && option.depth > 0) {
                <span class="muted">{{ parentPath(option) }} ›&nbsp;</span>
              }
              <span [class.root]="option.depth === 0">{{ option.category.name }}</span>
            </span>
          </mat-option>
        } @empty {
          <mat-option disabled>Aucune catégorie ne correspond</mat-option>
        }
      </mat-autocomplete>
      @if (hint()) {
        <mat-hint>{{ hint() }}</mat-hint>
      }
    </mat-form-field>
  `,
  styles: `
    .option {
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .root {
      font-weight: 500;
    }
    .dot-prefix {
      display: inline-flex;
      padding: 0 4px 0 14px;
    }
  `,
})
export class CategoryPickerComponent implements ControlValueAccessor {
  readonly type = input<CategoryType | null>(null);
  readonly label = input('Catégorie');
  readonly placeholder = input('Rechercher une catégorie…');
  readonly hint = input<string | null>(null);

  private readonly store = inject(DataStore);

  protected readonly value = signal<number | null>(null);
  protected readonly query = signal('');
  protected readonly searching = signal(false);
  protected readonly disabled = signal(false);

  protected readonly selected = computed(() => this.store.categoryOption(this.value()));
  // Pendant la recherche on affiche le texte tapé, sinon le chemin de la catégorie choisie
  protected readonly displayText = computed(() =>
    this.searching() ? this.query() : (this.selected()?.category.name ?? ''),
  );
  protected readonly displayWith = (id: number | null) =>
    this.store.categoryOption(id)?.category.name ?? '';
  private readonly options = computed(() => this.store.categoryOptions(this.type() ?? undefined));

  protected readonly filtered = computed<CategoryOption[]>(() => {
    const q = normalize(this.query().trim());
    if (!this.searching() || !q) {
      return this.options();
    }
    return this.options().filter((o) => normalize(o.path).includes(q));
  });

  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: number | null): void {
    this.value.set(value ?? null);
    this.searching.set(false);
    this.query.set(this.store.categoryOption(value)?.path ?? '');
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected parentPath(option: CategoryOption): string {
    return option.path.slice(0, option.path.lastIndexOf(' › '));
  }

  protected onInput(text: string): void {
    this.searching.set(true);
    this.query.set(text);
  }

  // Au focus, on sélectionne le texte pour pouvoir taper directement une nouvelle recherche
  protected onFocus(input: HTMLInputElement): void {
    input.select();
  }

  protected onBlur(): void {
    this.onTouched();
    // Texte saisi sans choisir d'option : on revient à la catégorie choisie
    setTimeout(() => {
      this.searching.set(false);
      this.query.set(this.selected()?.path ?? '');
    }, 200);
  }

  protected select(event: MatAutocompleteSelectedEvent): void {
    const id = event.option.value as number;
    this.value.set(id);
    this.searching.set(false);
    this.query.set(this.store.categoryOption(id)?.path ?? '');
    this.onChange(id);
  }

  protected clear(): void {
    this.value.set(null);
    this.query.set('');
    this.onChange(null);
  }
}
