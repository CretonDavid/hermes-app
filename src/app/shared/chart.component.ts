import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { ThemeService } from '../core/theme.service';

Chart.register(...registerables);
Chart.defaults.font.family = 'Quicksand, sans-serif';
Chart.defaults.plugins.legend.labels.usePointStyle = true;

// Le canvas ne connaît pas les variables CSS : on lit la couleur calculée pour le thème actif
function themeColor(token: string): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${token})`;
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

/**
 * Enveloppe minimale autour de Chart.js : le graphique est recréé quand la configuration ou le thème change.
 */
@Component({
  selector: 'app-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="chart-box" [style.height.px]="height()"><canvas #canvas></canvas></div>`,
  styles: `
    .chart-box {
      position: relative;
      width: 100%;
    }
  `,
})
export class ChartComponent implements OnDestroy {
  readonly config = input.required<ChartConfiguration>();
  readonly height = input(280);
  readonly clickable = input(false);
  // Index de l'élément cliqué (part de camembert, barre...)
  readonly elementClick = output<number>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly theme = inject(ThemeService);
  private chart: Chart | null = null;

  constructor() {
    effect(() => {
      const config = this.config();
      this.theme.isDark();
      Chart.defaults.color = themeColor('--mat-sys-on-surface-variant');
      Chart.defaults.borderColor = themeColor('--mat-sys-outline-variant');
      Chart.defaults.elements.arc.borderColor = themeColor('--mat-sys-surface-container-lowest');
      this.chart?.destroy();
      this.chart = new Chart(this.canvas().nativeElement, {
        ...config,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          ...config.options,
          // Curseur « main » sur les éléments cliquables
          onHover: (event, elements) => {
            const target = event.native?.target as HTMLElement | undefined;
            if (target) {
              target.style.cursor = elements.length > 0 && this.clickable() ? 'pointer' : 'default';
            }
          },
          onClick: (_event, elements) => {
            if (elements.length > 0) {
              this.elementClick.emit(elements[0].index);
            }
          },
        },
      });
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}
