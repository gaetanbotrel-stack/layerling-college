# Layerling pour le collège

**Une version adaptée de [Layerling](https://github.com/henmedia/layerling) pour des élèves de collège.**
Layerling est une CAO 3D gratuite qui fonctionne directement dans le navigateur, sans compte ni installation. Elle sert ici à faire modéliser des objets aux élèves (6e à 3e), puis à les imprimer en 3D.

> Ce dépôt est une version **non officielle**, sans lien avec l'auteur d'origine (Henmedia). Tout le mérite du logiciel lui revient : ce dépôt ne contient que les modifications décrites ci-dessous.

## Ce qui a été adapté

- **Hébergement dans un sous-dossier** d'un site web (par exemple `https://mon-site.fr/modelisation3d/`). Le logiciel d'origine exige d'être à la racine d'une adresse.
- **Mode simple imposé à tous les élèves** : bibliothèque de formes réduite, aucun lien vers l'extérieur, et un bouton **Importer** dans l'éditeur.
- **Taille des boutons réglable** : un tiers plus petits par défaut, et un curseur de 50 à 150 % dans Réglages → Ruban.
- **Import d'objets 3D simplifié** (OBJ, STL, 3MF, STEP) : une fenêtre demande la taille voulue en millimètres, propose de **redresser** un objet qui arrive couché, et le pose **au milieu du plateau**.
- **Aucun appel vers l'extérieur** depuis les postes des élèves (annonces, vérification de nouvelles versions).
- **Pas de copie hors ligne** (service worker) dans ce mode, pour ne pas charger 160 Mo sur chaque poste.
- **Pas de stockage sur le serveur** : chaque élève enregistre son fichier `.lyl` sur son poste ou sur sa clé.
- **Laboratoire de simulation** (dominos, bille, objets « statiques ») avec le moteur physique [Rapier](https://rapier.rs), chargé seulement quand on l'ouvre. On y accède depuis le groupe « Organiser » du ruban.

## Fabriquer le site

Il faut [Node.js](https://nodejs.org/) installé. Ensuite :

```bash
npm ci
# Avec Git Bash sous Windows, cette ligne évite que « /modelisation3d » soit transformé en chemin Windows :
export MSYS_NO_PATHCONV=1
export LAYERLING_BASE_PATH=/modelisation3d
export LAYERLING_EDITOR_PROFILE='{"version":1,"base":"simple","tools":{"import":{"visible":true}}}'
npm run export
```

Le site est produit dans `apps/web/.next-export/` : il suffit de déposer son contenu dans le dossier voulu de votre hébergement (FTP).
Avant de déposer, vous pouvez retirer `store.php`, `sw.js`, `support.html` et les guides des langues inutiles pour alléger le dépôt.

Pour une autre adresse que `/modelisation3d`, changez la valeur de `LAYERLING_BASE_PATH`.

## Pour en savoir plus

- **[Explications détaillées des adaptations](https://github.com/gaetanbotrel-stack/layerling-college/blob/main/COLLEGE.md)** : fichiers modifiés, remarques, limites.
- **[Guide d'utilisation de Layerling en français](https://github.com/gaetanbotrel-stack/layerling-college/tree/main/docs/guide/fr)** : le guide officiel, traduit par le projet d'origine.
- [Présentation d'origine du projet (en anglais)](https://github.com/gaetanbotrel-stack/layerling-college/blob/main/README.md).

## Remarques

- Testé avec des versions récentes d'Edge et de Firefox.
- Les outils de chanfrein, congé, creux et couvercle téléchargent un fichier de 20 Mo la première fois qu'on s'en sert.
- Ces modifications sont fournies telles quelles, sans garantie.

## Licence

**AGPL-3.0**, comme le projet d'origine (voir [LICENSE](https://github.com/gaetanbotrel-stack/layerling-college/blob/main/LICENSE)). Si vous mettez en ligne une version modifiée, vous devez en rendre le code source accessible à ses utilisateurs.
Le moteur Rapier est sous licence Apache-2.0 et three.js sous licence MIT.
