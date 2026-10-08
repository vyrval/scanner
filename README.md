# Carnet

Site statique (PWA) publié sur GitHub Pages par `.github/workflows/pages.yml`.

## Environnements

| Branche   | URL                                         |
|-----------|---------------------------------------------|
| `main`    | https://vyrval.github.io/scanner/           |
| `staging` | https://vyrval.github.io/scanner/staging/   |

Un dépôt n'a qu'un site Pages : chaque push sur `main` ou `staging` relance le
workflow, qui récupère **les deux branches** et republie le site entier (la
prod à la racine, la préproduction sous `staging/`). Un push sur `staging` ne
change donc pas le contenu de la prod, il la redéploie telle quelle.

Les deux branches doivent exister sur GitHub, sinon le déploiement échoue.
Elles doivent aussi être autorisées dans *Settings → Environments →
github-pages → Deployment branches*.

## Travailler avec la préproduction

```sh
git switch staging          # développer et pousser ici
git push                    # puis tester sur /scanner/staging/
git switch main && git merge staging && git push   # mise en prod une fois validé
```

## Ce qui sépare la préproduction de la prod

Les deux sont sur le même domaine, donc partagent le même `localStorage` et le
même espace de caches. La séparation repose sur le chemin `/staging/` :

- `js/env.js` : `STAGING` et `NS`, le préfixe des clés `localStorage`
  (`carnet:*` en prod, `carnet-staging:*` en préproduction). Toute nouvelle clé
  doit utiliser `NS`, jamais `"carnet:"` en dur.
- `sw.js` : cache `carnet-staging-v*` à part, et le service worker de la prod
  (dont la portée `/scanner/` englobe `/scanner/staging/`) ignore les requêtes
  de la préproduction.
- Bandeau « STAGING » en haut de l'écran (`css/style.css`), « · staging » après
  la version dans les réglages.
- Le workflow renomme l'appli installée en « … (staging) » / « … β » dans le
  manifeste.

## Licence

Le code est publié sous [PolyForm Noncommercial 1.0.0](LICENSE.md) : libre
pour un usage personnel ou non commercial (lire, modifier, partager), toute
utilisation commerciale est réservée à l'auteur. Ce n'est pas une licence
open source au sens de l'OSI.

Les données tierces gardent leur propre licence :

- `data/ciqual.json` : extrait de la [table Ciqual](https://ciqual.anses.fr)
  de l'ANSES, Licence Ouverte / Etalab.
- Données produits interrogées en ligne : [Open Food Facts](https://world.openfoodfacts.org),
  base sous ODbL, images sous CC BY-SA.
- Lecteur de code-barres ZXing (chargé depuis jsdelivr) : Apache 2.0.
