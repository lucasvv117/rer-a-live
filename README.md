# RER A en direct

Plan de ligne du RER A sur lequel les trains avancent en temps réel, à partir de l’API
« Prochains passages – requête globale » d’Île-de-France Mobilités (PRIM).

La position de chaque train est **estimée** : elle est interpolée entre le dernier arrêt
desservi et le prochain, d’après les heures d’arrivée estimées. Ce n’est pas une position GPS.

## Économie de requêtes

- Le suivi ne démarre que sur clic (« Lancer le suivi ») et s’arrête avec « Arrêter le suivi ».
- Il s’arrête tout seul après 15 minutes, et dès que l’onglet n’est plus visible.
- Pendant le suivi, le navigateur interroge `/api/trains` toutes les 30 secondes.
- `/api/trains` est mis en cache 30 secondes par le CDN Vercel : les visiteurs partagent
  au plus une requête PRIM toutes les 30 secondes (par région Vercel).
- Option « Afficher les appels API » : une notification et un journal résument chaque appel
  (trains reçus, sens, retards, heure des données PRIM, cache, durée, taille).

## Lancer en local

```bash
npm install
PRIM_API_KEY=<votre clé PRIM> npm run dev
```

## Déploiement (Vercel)

Définir la variable d’environnement `PRIM_API_KEY` dans le projet Vercel. La clé n’est jamais
envoyée au navigateur et ne doit pas être committée.

## Structure

- `app/api/trains/route.ts` : appelle PRIM avec la clé et renvoie un JSON allégé (~70 Ko au lieu de ~400 Ko).
- `lib/prim.ts` : conversion de la réponse SIRI Lite en liste de trains et d’arrêts.
- `lib/line.ts` : gares, branches, identifiants IDFM et géométrie du plan.
- `lib/position.ts` : calcul de la position de chaque train à un instant donné.
- `components/LiveMap.tsx` : interface (plan, train sélectionné, liste, démarrage/arrêt).
