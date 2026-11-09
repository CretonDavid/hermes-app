# Journal des versions

Toutes les évolutions notables du front d'Hermès sont listées ici. Les numéros de version suivent
[SemVer](https://semver.org/lang/fr/).

## [1.0.0] - 2026-11-09

Première version publiée.

### Interface

- Application Angular en français, en thème clair ou sombre, avec la police Nunito et la palette
  « aubergine et safran ». Polices et icônes sont servies par l'application elle-même.
- Parcours guidés pour la première utilisation, états vides explicites et fenêtres de formulaire
  qui protègent les saisies en cours.
- Version de l'application affichée dans les Paramètres.

### Fonctionnalités

- Connexion et inscription par numéro d'accès, renouvellement de session transparent.
- Tableau de bord : patrimoine, revenus, dépenses et épargne du mois, dépenses par catégorie,
  évolution sur 6 mois, dernières opérations et échéances des 30 prochains jours.
- Comptes bancaires : création, types personnalisés, fiche détaillée, clôture et suppression.
- Opérations : filtres sur une ligne, tri, totaux par devise, catégorisation groupée, virements
  entre comptes et entre devises, export CSV.
- Catégories à plusieurs niveaux, dépenses et revenus.
- Récurrences : échéances du mois en cours, remboursements par un ou plusieurs tiers et historique
  des remboursements, avec une pastille quand un remboursement est en retard.
- Import CSV et OFX avec écran de vérification, et rapprochement bancaire pas à pas.
- Statistiques avec graphiques : dépenses, revenus, épargne et patrimoine, convertis dans une devise
  de référence.
- Paramètres : profil, désactivation ou suppression du compte, types de comptes, devises et taux de
  change.

### Exploitation

- Image Docker servie par nginx, qui relaie aussi `/api` vers l'API, avec des en-têtes de sécurité
  et une politique de sécurité du contenu (CSP) stricte.
- Intégration continue GitHub Actions : ESLint (règles Angular et SonarJS), tests et compilation de
  production.

[1.0.0]: https://github.com/CretonDavid/hermes-app/releases/tag/v1.0.0
