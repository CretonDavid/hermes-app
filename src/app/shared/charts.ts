import { ChartConfiguration } from 'chart.js';
import { formatMonth } from '../core/format';
import { CategoryStat, MonthlyStat } from '../core/models';
import { formatMoney } from './money.pipe';

// Tons moyens, contrastés (au moins 3:1) sur les fonds clair et sombre
export const INCOME_COLOR = '#43a047';
export const EXPENSE_COLOR = '#e53935';
export const SAVINGS_COLOR = '#1e88e5';
export const SAVINGS_FILL = 'rgba(30, 136, 229, 0.12)';

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

export function donutChart(items: CategoryStat[], currency: string): ChartConfiguration {
  const config: ChartConfiguration<'doughnut'> = {
    type: 'doughnut',
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
      cutout: '62%',
      plugins: {
        legend: { position: 'right' },
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
