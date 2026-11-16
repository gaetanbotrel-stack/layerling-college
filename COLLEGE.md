# Layerling : version adaptée pour un collège

Ce dépôt est une **version adaptée, non officielle** de [Layerling](https://github.com/henmedia/layerling) (v1.165.2), la CAO 3D gratuite qui tourne dans le navigateur, créée par Henmedia.
Je ne suis pas affilié à l'auteur d'origine : tout le mérite du logiciel lui revient, ce dépôt ne contient que les modifications décrites ci-dessous.

Licence : **AGPL-3.0**, comme le projet d'origine (voir `LICENSE`). Si vous mettez en ligne une version modifiée, vous devez en rendre le code source accessible à ses utilisateurs : c'est le rôle de ce dépôt.

## Ce qui a été adapté

L'objectif : proposer Layerling à des élèves de collège (6e à 3e) sur un hébergement web mutualisé classique (fichiers statiques), sans compte ni serveur d'applications.

- **Hébergement dans un sous-dossier** (par exemple `https://mon-site.fr/modelisation3d/`) : tous les chemins du logiciel sont préfixés grâce à la variable `LAYERLING_BASE_PATH` (`apps/web/src/lib/basePath.ts`, `scripts/prefix-base-path.mjs`). Le logiciel d'origine suppose d'être à la racine d'une adresse.
- **Mode simple imposé à tous les élèves**, par le profil d'éditeur prévu par Layerling (`LAYERLING_EDITOR_PROFILE`) : gros boutons, bibliothèque de formes réduite, aucun lien vers l'extérieur.
- **Aucun appel vers GitHub** depuis les postes (annonces, nouvelles versions) quand le logiciel est hébergé dans un sous-dossier.
- **Pas de service worker** dans ce mode, pour éviter de copier 160 Mo sur chaque poste.
- **Pas de stockage serveur partagé** : chaque élève enregistre son fichier `.lyl` sur son poste (supprimer `store.php` de l'export).
- **Laboratoire de simulation** (physique : dominos, bille, objets « statiques ») : nouveau composant `apps/web/src/components/SimulationLab.tsx`, avec le moteur [Rapier](https://rapier.rs) (Apache-2.0) et three.js. Il se charge à la demande et est accessible depuis le groupe « Organiser » du ruban.

Fichiers principalement concernés : `apps/web/next.config.ts`, `apps/web/src/lib/basePath.ts`, `apps/web/src/components/SimulationLab.tsx`, `apps/web/src/components/workplane/SecondaryToolbar.tsx`, `apps/web/src/components/LayerlingEditor.tsx`, `scripts/build-static-export.mjs`, `scripts/prefix-base-path.mjs`.

## Fabriquer le site

```bash
npm ci
# Git Bash sous Windows : MSYS_NO_PATHCONV=1 évite que « /modelisation3d » soit transformé en chemin Windows
export MSYS_NO_PATHCONV=1
export LAYERLING_BASE_PATH=/modelisation3d
export LAYERLING_EDITOR_PROFILE='{"version":1,"base":"simple","tools":{}}'
npm run export
```

Le site statique est produit dans `apps/web/.next-export/` : déposez son contenu dans le dossier voulu de votre hébergement.
Avant de déposer, vous pouvez retirer `store.php`, `sw.js`, `support.html` et les guides des langues dont vous n'avez pas besoin pour alléger le dépôt.

## Remarques

- Compatible navigateurs Chrome, Edge et Firefox (testé sur Edge et Firefox récents).
- Les fonctions de chanfrein, congé, creux et couvercle chargent un fichier de 20 Mo la première fois qu'on s'en sert.
- Ces modifications sont fournies telles quelles, sans garantie.
