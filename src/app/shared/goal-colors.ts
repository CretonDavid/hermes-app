import { Goal } from '../core/models';

// Couleurs des budgets spéciaux, dans l'ordre de création des budgets en cours
export const GOAL_COLORS = ['#b39ddb', '#f4b942', '#4fd1b5', '#ff8fa8', '#64b5f6', '#ffb74d'];

/**
 * Couleur de chaque budget spécial en cours, tous comptes confondus : la même partout
 * (page Budgets, tableau de bord). Les budgets sont attendus dans l'ordre de création.
 */
export function goalColors(activeGoals: Goal[]): Map<number, string> {
  return new Map(
    activeGoals.map((goal, index) => [goal.id, GOAL_COLORS[index % GOAL_COLORS.length]]),
  );
}
