import { ChangeDetectionStrategy, Component, OnInit, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  endOfMonth,
  endOfYear,
  startOfMonth,
  startOfYear,
  subMonths,
  subYears,
} from 'date-fns';
import { toIsoDate } from '../core/format';

export interface Period {
  from: string;
  to: string;
}

export type PeriodPreset = 'month' | 'lastMonth' | '3months' | '6months' | '12months' | 'year' | 'lastYear' | 'custom';

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'month', label: 'Ce mois-ci' },
  { value: 'lastMonth', label: 'Mois dernier' },
  { value: '3months', label: '3 derniers mois' },
  { value: '6months', label: '6 derniers mois' },
  { value: '12months', label: '12 derniers mois' },
  { value: 'year', label: 'Cette année' },
  { value: 'lastYear', label: 'Année dernière' },
  { value: 'custom', label: 'Personnalisée' },
];

export function presetPeriod(preset: PeriodPreset): Period | null {
  const now = new Date();
  const range = (from: Date, to: Date): Period => ({ from: toIsoDate(from)!, to: toIsoDate(to)! });
  switch (preset) {
    case 'month':
      return range(startOfMonth(now), endOfMonth(now));
    case 'lastMonth':
      return range(startOfMonth(subMonths(now, 1)), endOfMonth(subMonths(now, 1)));
    case '3months':
      return range(startOfMonth(subMonths(now, 2)), endOfMonth(now));
    case '6months':
      return range(startOfMonth(subMonths(now, 5)), endOfMonth(now));
    case '12months':
      return range(startOfMonth(subMonths(now, 11)), endOfMonth(now));
    case 'year':
      return range(startOfYear(now), endOfYear(now));
    case 'lastYear':
      return range(startOfYear(subYears(now, 1)), endOfYear(subYears(now, 1)));
    default:
      return null;
  }
}

@Component({
  selector: 'app-period-picker',
  imports: [FormsModule, MatSelectModule, MatFormFieldModule, MatDatepickerModule, MatInputModule, MatButtonToggleModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="period">
      <mat-form-field class="preset">
        <mat-label>Période</mat-label>
        <mat-select [ngModel]="preset()" (ngModelChange)="selectPreset($event)">
          @for (p of presets; track p.value) {
            <mat-option [value]="p.value">{{ p.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      @if (preset() === 'custom') {
        <mat-form-field class="range">
          <mat-label>Du … au</mat-label>
          <mat-date-range-input [rangePicker]="picker">
            <input matStartDate placeholder="Début" [ngModel]="start()" (ngModelChange)="start.set($event)" />
            <input matEndDate placeholder="Fin" [ngModel]="end()" (ngModelChange)="end.set($event); emitCustom()" />
          </mat-date-range-input>
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-date-range-picker #picker />
        </mat-form-field>
      }
    </div>
  `,
  styles: `
    .period {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .preset {
      width: 200px;
    }
    .range {
      width: 260px;
    }
  `,
})
export class PeriodPickerComponent implements OnInit {
  readonly initial = input<PeriodPreset>('month');
  readonly periodChange = output<Period>();

  protected readonly presets = PRESETS;
  protected readonly preset = signal<PeriodPreset>('month');
  protected readonly start = signal<Date | null>(null);
  protected readonly end = signal<Date | null>(null);

  ngOnInit(): void {
    this.preset.set(this.initial());
  }

  protected selectPreset(preset: PeriodPreset): void {
    this.preset.set(preset);
    const period = presetPeriod(preset);
    if (period) {
      this.periodChange.emit(period);
    }
  }

  protected emitCustom(): void {
    const start = this.start();
    const end = this.end();
    if (start && end) {
      this.periodChange.emit({ from: toIsoDate(start)!, to: toIsoDate(end)! });
    }
  }
}
