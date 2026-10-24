import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);
Chart.defaults.font.family = 'Roboto, sans-serif';
Chart.defaults.color = '#44474e';
Chart.defaults.plugins.legend.labels.usePointStyle = true;

/**
 * Enveloppe minimale autour de Chart.js : le graphique est recréé quand la configuration change.
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
  // Index de l'élément cliqué (part de camembert, barre...)
  readonly elementClick = output<number>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: Chart | null = null;

  constructor() {
    effect(() => {
      const config = this.config();
      this.chart?.destroy();
      this.chart = new Chart(this.canvas().nativeElement, {
        ...config,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          ...config.options,
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
