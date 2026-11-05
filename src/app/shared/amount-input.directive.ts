import { Directive, ElementRef, HostListener, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

const FORMAT = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});

export function formatAmount(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : FORMAT.format(value).replace('−', '-');
}

// Accepte la virgule ou le point, les espaces et le signe moins ; null si ce n'est pas un nombre
export function parseAmount(text: string): number | null {
  const normalized = text.replace(/[\s  ]/g, '').replace(',', '.').replace('−', '-');
  if (!/^-?\d*\.?\d*$/.test(normalized) || !/\d/.test(normalized)) {
    return null;
  }
  return Number(normalized);
}

/**
 * Champ de montant : affiche « 850,00 » à la française et transmet un nombre au formulaire.
 */
@Directive({
  selector: 'input[appAmount]',
  host: { type: 'text', inputmode: 'decimal', autocomplete: 'off' },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AmountInputDirective),
      multi: true,
    },
  ],
})
export class AmountInputDirective implements ControlValueAccessor {
  private readonly input = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: number | null): void {
    this.input.value = formatAmount(value);
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.input.disabled = disabled;
  }

  @HostListener('input')
  protected onInput(): void {
    this.onChange(parseAmount(this.input.value));
  }

  @HostListener('blur')
  protected onBlur(): void {
    this.onTouched();
    const value = parseAmount(this.input.value);
    if (value !== null) {
      this.input.value = formatAmount(value);
    }
  }
}
