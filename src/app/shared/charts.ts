import { Chart, ChartConfiguration, Plugin } from 'chart.js';
import { formatMonth } from '../core/format';
import { CategoryStat, MonthlyStat } from '../core/models';
import { formatMoney } from './money.pipe';

// Tons moyens, contrastés (au moins 3:1) sur les fonds clair et sombre
export const INCOME_COLOR = '#0f9d82';
export const EXPENSE_COLOR = '#e5486d';
export const SAVINGS_COLOR = '#8a63d2';
export const SAVINGS_FILL = 'rgba(138, 99, 210, 0.14)';

const FALLBACK = [
  '#5c6bc0',
  '#26a69a',
  '#ffa726',
  '#ec407a',
  '#7e57c2',
  '#42a5f5',
  '#9ccc65',
  '#8d6e63',
];

export function categoryColors(items: CategoryStat[]): string[] {
  const colors = items.map((item, index) => item.color ?? FALLBACK[index % FALLBACK.length]);
  // Des sous-catégories qui héritent toutes de la couleur du parent sont déclinées en nuances
  if (colors.length > 1 && new Set(colors).size === 1) {
    return shades(colors[0], colors.length);
  }
  return colors;
}

function shades(hex: string, count: number): string[] {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return Array.from({ length: count }, (_, i) => {
    // De la couleur assombrie à la couleur éclaircie
    const factor = count === 1 ? 0 : -0.35 + (0.95 * i) / (count - 1);
    const mixed = rgb.map((c) =>
      Math.round(factor < 0 ? c * (1 + factor) : c + (255 - c) * factor),
    );
    return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  });
}

// Axe des dates lisible : étiquettes horizontales et espacées
export const DATE_AXIS = { ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 24 } };

// Affiche le total au centre de l'anneau
function donutTotal(label: string): Plugin<'doughnut'> {
  return {
    id: 'donutTotal',
    afterDraw(chart) {
      const arc = chart.getDatasetMeta(0).data[0];
      if (!arc) {
        return;
      }
      const { ctx } = chart;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = String(Chart.defaults.color);
      ctx.font = '600 12px Nunito, sans-serif';
      ctx.fillText('Total', arc.x, arc.y - 12);
      // Le canvas hérite de la couleur de texte de la carte
      ctx.fillStyle = getComputedStyle(chart.canvas).color;
      ctx.font = '800 18px Nunito, sans-serif';
      ctx.fillText(label, arc.x, arc.y + 12);
      ctx.restore();
    },
  };
}

const HINT_FONT = '12px Nunito, sans-serif';
const HINT_LINE_HEIGHT = 16;
const HINT_GAP = 8;

// Coupe aux espaces, seulement si le texte dépasse la largeur disponible
function wrapText(text: string, width: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate) > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  lines.push(line);
  return lines;
}

// Centre le texte sous l'anneau, en le décalant juste assez pour qu'il reste dans le cadre.
// Sur plusieurs lignes, il occupe tout le cadre : il est donc centré sur celui-ci.
export function layoutHint(
  text: string,
  ringCenter: number,
  width: number,
  measure: (s: string) => number,
): { lines: string[]; x: number } {
  const lines = wrapText(text, width, measure);
  if (lines.length > 1) {
    return { lines, x: width / 2 };
  }
  const half = measure(text) / 2;
  return { lines, x: Math.min(Math.max(ringCenter, half), width - half) };
}

function chartHint(chart: Chart, text: string): { lines: string[]; x: number } {
  const { ctx, chartArea, width } = chart;
  ctx.save();
  ctx.font = HINT_FONT;
  const ringCenter = chartArea ? (chartArea.left + chartArea.right) / 2 : width / 2;
  const layout = layoutHint(text, ringCenter, width, (s) => ctx.measureText(s).width);
  ctx.restore();
  return layout;
}

function donutHint(text: string): Plugin<'doughnut'> {
  return {
    id: 'donutHint',
    afterDraw(chart) {
      const { lines, x } = chartHint(chart as unknown as Chart, text);
      const { ctx, height } = chart;
      ctx.save();
      ctx.font = HINT_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = String(Chart.defaults.color);
      lines.forEach((line, i) => {
        ctx.fillText(line, x, height - (lines.length - i) * HINT_LINE_HEIGHT);
      });
      ctx.restore();
    },
  };
}

export function donutChart(
  items: CategoryStat[],
  currency: string,
  hint?: string,
): ChartConfiguration {
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const config: ChartConfiguration<'doughnut'> = {
    type: 'doughnut',
    plugins: [donutTotal(formatMoney(total, currency)), ...(hint ? [donutHint(hint)] : [])],
    data: {
      labels: items.map((i) => i.name),
      datasets: [
        {
          data: items.map((i) => i.amount),
          backgroundColor: categoryColors(items),
          borderWidth: 2,
        },
      ],
    },
    options: {
      cutout: '72%',
      // Réserve sous le graphique la hauteur des lignes du texte d'aide
      ...(hint
        ? {
            layout: {
              padding: ({ chart }: { chart: Chart }) => ({
                bottom: chartHint(chart, hint).lines.length * HINT_LINE_HEIGHT + HINT_GAP,
              }),
            },
          }
        : {}),
      plugins: {
        legend: {
          position: 'right',
          labels: {
            // La légende donne aussi le montant de chaque catégorie
            generateLabels: (chart) =>
              Chart.overrides.doughnut.plugins.legend.labels
                .generateLabels(chart)
                .map((label, i) => ({
                  ...label,
                  text: `${label.text} · ${formatMoney(items[i].amount, currency)}`,
                })),
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const item = items[ctx.dataIndex];
              return ` ${formatMoney(item.amount, currency)} (${Math.round(item.share * 1000) / 10} %)`;
            },
          },
        },
      },
    },
  };
  return config as unknown as ChartConfiguration;
}

export function incomeExpenseChart(
  months: MonthlyStat[],
  currency: string,
  withNet = true,
): ChartConfiguration {
  return {
    type: 'bar',
    data: {
      labels: months.map((m) => formatMonth(m.month)),
      datasets: [
        {
          label: 'Revenus',
          data: months.map((m) => m.income),
          backgroundColor: INCOME_COLOR,
          borderRadius: 4,
        },
        {
          label: 'Dépenses',
          data: months.map((m) => m.expenses),
          backgroundColor: EXPENSE_COLOR,
          borderRadius: 4,
        },
        ...(withNet
          ? [
              {
                type: 'line' as const,
                order: -1,
                label: 'Solde du mois',
                data: months.map((m) => m.net),
                borderColor: SAVINGS_COLOR,
                backgroundColor: SAVINGS_COLOR,
                tension: 0.3,
              },
            ]
          : []),
      ],
    },
    options: {
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label} : ${formatMoney(ctx.parsed.y, currency)}`,
          },
        },
      },
      scales: { y: { ticks: { callback: (v) => formatMoney(Number(v), currency) } } },
    },
  } as ChartConfiguration;
}
