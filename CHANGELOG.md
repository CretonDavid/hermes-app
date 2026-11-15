# Journal des versions

Toutes les évolutions notables du front d'Hermès sont listées ici. Les numéros de version suivent
[SemVer](https://semver.org/lang/fr/).

## [1.1.0] - 2026-11-15

### Ajouts

- Plafond des comptes d'épargne, réglé dans Paramètres → Plafonds avec des suggestions (Livret A,
  LDDS, LEP, Livret jeune, PEL) : jauge sur les cartes des comptes, carte « Plafond » sur la fiche
  (affichée à la demande) et avertissement sans blocage dans le formulaire d'opération.
- Ventilation d'une opération sur plusieurs catégories, la dernière ligne recevant automatiquement
  le reste, avec un libellé facultatif par ligne.
- Page « Budgets », sous Récurrences dans le menu :
  - enveloppes mensuelles par catégorie de dépense ;
  - budgets spéciaux liés à un compte, avec la répartition de chaque compte (budgets et argent
    libre), un filtre par compte et un bouton « Affecter ».
- Tableau de bord : enveloppes du mois en anneaux de progression et budgets spéciaux côte à côte.

### Modifications

- Libellé de l'opération affiché directement dans la fenêtre, hors de « Plus de détails ».
- Champs obligatoires signalés en erreur seulement après saisie ou tentative d'enregistrement.
- Le formulaire d'opération ouvert depuis la fiche d'un compte présélectionne ce compte.

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

[1.1.0]: https://github.com/CretonDavid/hermes-app/releases/tag/v1.1.0
[1.0.0]: https://github.com/CretonDavid/hermes-app/releases/tag/v1.0.0
