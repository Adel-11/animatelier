# Domaines d'images libres à autoriser

À ajouter dans la politique réseau de l'organisation (comme `n8n.letter-bird.com`).
Pour chaque source il faut l'hôte de l'API **et** l'hôte qui sert les fichiers, sinon le téléchargement échoue.

## Priorité 1, celles qui remplacent vraiment Wikimedia

| Source | Domaines | Contenu | Clé API |
|---|---|---|---|
| Flickr | `api.flickr.com`, `live.staticflickr.com`, `www.flickr.com` | Le plus gros gisement de photos de célébrités en CC BY (dont Gage Skidmore, Raph_PH, qui alimentent Wikipédia) | gratuite |
| Openverse | `api.openverse.org`, `openverse.org` | Moteur qui agrège Flickr, Wikimedia, musées, Nappy, etc. Une seule API pour tout | non |
| PICRYL | `picryl.com`, `cdn.picryl.com`, `thumbnails.picryl.com` | Archives du domaine public (millions d'images historiques) | non |
| Wikipédia (en plus de Commons) | `en.wikipedia.org`, `fr.wikipedia.org`, `api.wikimedia.org` | Portrait principal d'un article en un appel, moins limité que l'API Commons | non |

## Priorité 2, banques de photos génériques

| Source | Domaines | Contenu | Clé API |
|---|---|---|---|
| Unsplash | `api.unsplash.com`, `images.unsplash.com` | Photos de haute qualité, thèmes généraux | gratuite |
| Pexels | `api.pexels.com`, `images.pexels.com` | Photos et vidéos | gratuite |
| Pixabay | `pixabay.com`, `cdn.pixabay.com` | Photos, illustrations, vecteurs | gratuite |
| PxHere | `pxhere.com` | Photos CC0 | non |
| StockSnap | `stocksnap.io`, `cdn.stocksnap.io` | Photos CC0 | non |
| Openclipart | `openclipart.org` | Dessins et pictogrammes du domaine public | non |

## Priorité 3, musées et archives (domaine public, utile pour l'art, l'histoire, la science)

| Source | Domaines | Contenu | Clé API |
|---|---|---|---|
| Metropolitan Museum | `collectionapi.metmuseum.org`, `images.metmuseum.org` | Œuvres d'art en haute définition | non |
| Art Institute of Chicago | `api.artic.edu`, `www.artic.edu` | Peintures | non |
| Smithsonian Open Access | `api.si.edu`, `ids.si.edu` | 4 millions d'objets | gratuite |
| NASA | `images-api.nasa.gov`, `images-assets.nasa.gov` | Espace, astronomie | non |
| Library of Congress | `www.loc.gov`, `tile.loc.gov` | Photos et affiches historiques | non |
| Europeana | `api.europeana.eu` | Patrimoine européen | gratuite |
| NYPL Digital Collections | `api.repo.nypl.org`, `images.nypl.org` | Archives | gratuite |
| Rijksmuseum | `www.rijksmuseum.nl`, `lh3.googleusercontent.com` | Peintures néerlandaises | gratuite |

## Remarques

- Les clés API gratuites (Flickr, Unsplash, Pexels, Pixabay) sont à créer une fois ; je peux te dire
  où les coller (n8n ou variable d'environnement) quand les domaines seront ouverts.
- Flickr + Openverse suffisent pour les quiz « devine la star » : c'est là que sont les photos
  de tapis rouge en CC BY, et sans la limitation de débit de Wikimedia.
- Attention, sur Flickr il faut filtrer par licence (CC BY, CC BY-SA, CC0, domaine public).
  Je le ferai systématiquement et je continuerai à livrer le fichier des sources avec les crédits.
