# Hermès — hermes-app

Interface web de l'application de comptabilité personnelle Hermès, branchée sur [hermes-api](../hermes-api).

Stack : Angular 22 (composants standalone, signals, zoneless), Angular Material 3, Chart.js, date-fns.

## Démarrage

Prérequis : Node 24 et l'API démarrée sur `http://localhost:8080` (URL modifiable dans `src/environments/`).

```bash
npm install
npm start              # http://localhost:4200
npm test               # tests unitaires (Vitest)
npm run build          # build de production dans dist/
```

## Qualité

```bash
npm run lint           # ESLint : règles Angular, typescript-eslint et SonarJS (règles de SonarQube)
npm run format:check   # formatage Prettier (npm run format pour corriger)
npm run test:ci        # tests avec couverture dans coverage/
```

TypeScript et les templates sont compilés en mode strict. La CI GitHub Actions lance formatage, lint, tests, `npm audit` et build de production à chaque push ; Dependabot propose chaque semaine les mises à jour.

## Sécurité

- Polices (Nunito, Material Symbols) auto-hébergées : aucune requête vers un service tiers.
- nginx envoie une Content-Security-Policy stricte (`script-src 'self'`, aucun script en ligne : le thème initial est appliqué par `public/theme-init.js`), ainsi que `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` ; voir `nginx/security-headers.conf`.
- Les routes `/api/auth/` sont limitées par nginx en plus de l'API.
- La déconnexion révoque la session côté serveur et vide les données gardées en mémoire. Si deux onglets rafraîchissent la session en même temps, le second reprend les jetons du premier.
- L'export CSV neutralise les textes interprétables comme des formules par un tableur.

## Fonctionnalités

- **Connexion par numéro de compte** à 30 chiffres (création, copie et téléchargement du numéro, réactivation d'un compte désactivé). Les tokens sont rafraîchis automatiquement.
- **Tableau de bord** : patrimoine total, revenus, dépenses et épargne du mois, répartition des dépenses, évolution sur 6 mois, dernières opérations et échéances à venir.
- **Comptes** : regroupés par type, solde à date, prévisionnel et pointé, historique du solde, rapprochement bancaire.
- **Opérations** : saisie de dépenses, revenus et virements (auto-complétion du tiers avec sa catégorie habituelle), pointage en un clic, recherche et filtres.
- **Récurrences** : loyer, salaire, abonnements, épargne programmée, avec estimation mensuelle et calendrier.
- **Import** de relevés CSV (mapping des colonnes deviné puis mémorisé par compte) et OFX, avec détection des doublons et suggestion de catégories.
- **Catégories** hiérarchiques avec couleur et icône.
- **Statistiques** sur une période et des comptes au choix : revenus et dépenses mensuels, répartition par catégorie avec exploration des sous-catégories, patrimoine, épargne et taux d'épargne, principaux tiers.
- **Paramètres** : devise de référence, types de compte, devises personnelles, taux de change (synchronisation BCE), désactivation ou suppression du compte.

## Organisation

```
src/app/
  core/        modèles de l'API, services HTTP, authentification, store des données de référence
  shared/      pipe monétaire, graphiques, dialogue de confirmation, sélecteur de période
  layout/      coquille (navigation latérale)
  features/    une page par dossier (dashboard, accounts, transactions, recurring, import, categories, stats, settings, auth)
```

Après chaque modification d'opérations, `DataStore.transactionsChanged()` recharge les soldes et prévient les pages ouvertes, qui se mettent à jour.
