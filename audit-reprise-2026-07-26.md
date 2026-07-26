# Audit reprise projet — Glow Nails — 26/07/2026

## TL;DR
Stack : vanilla HTML/JS monofichier (index.html ~6100 lignes) + Firebase (Auth, Firestore, FCM, Cloud Functions nodemailer) + PWA (service-worker.js) + Vercel.
Etat : app en prod, tres active (resas quotidiennes), 5 bugs signales par les clientes, causes identifiees.
Peut-on modifier en toute securite : oui, avec precautions — tout est dans index.html, zero build, chaque edit part direct en prod au push.

## Contexte de cet audit
Marion remonte 5 symptomes clientes : points fidelite qui disparaissent, RDV non affiches, annulations non repercutees, interface qui disparait, jours bloques invisibles. Diagnostic complet ci-dessous (section 10).

## 1-2. Inventaire et stack
- `index.html` : TOUTE l'app (admin Marion + espace cliente + login + inscription). Firebase SDK v9+ modulaire via imports ESM CDN.
- `service-worker.js` : PWA cache shell, CACHE_NAME = "glow-nails-v4".
- `firebase-messaging-sw.js` : FCM push Marion.
- `functions/index.js` : emails (nodemailer Gmail Workspace) + push FCM multicast `admin_devices`.
- `firebase.json` : declare UNIQUEMENT functions. Les rules Firestore ne sont PAS dans le repo (gerees console).
- Fichiers legacy non references : `glow-nails-v6.html`, `index.backup.html`, `index.html.bak`, `audit-glow-nails.html`.
- Git : local = origin/main, aucun drift. Projet Firebase : `glow-nails-app`.

## 5. Donnees Firestore (verifiees live le 26/07)
Collections : agenda, blocked, galerie, listes, notifications, photos_clientes, posts, rdvs, settings, slots, users.
- `rdvs` : uid (auth uid), email, prenom, nom, prestation, date (string fr), jour/mois/annee (ints, mois 0-indexe), heure ("9h00"), duree, prix, ts, statut in {en_attente, confirme, annule, refuse, desistement}. Au 26/07 : aucun doc "desistement" en base.
- `blocked` : docId = "annee-mois-jour" SANS padding, mois 0-indexe (ex "2026-6-20" = 20 juillet 2026). Champs annee/mois/jour/ts. Alimente regulierement par Marion.
- `users` : docId = auth uid. Champ `fideliteOffset` (ajustement manuel fidelite, ecrit uniquement fiche admin, merge:true partout).
- Admin identifie par EMAIL dans les rules : glownails.contact31@gmail.com (pas de collection admins).

## 6. Securite — rules deployees (recuperees le 26/07)
- Match global `/{document=**}` : full access si email == glownails.contact31@gmail.com.
- Ouvertures specifiques par collection pour les clientes authentifiees (rdvs, slots, notifications, settings, listes, galerie, posts, photos_clientes, users own-doc).
- **TROU CRITIQUE : aucune regle pour `blocked`** → lecture refusee aux clientes (seul l'admin passe via le match global). Cause racine du symptome "jours bloques invisibles".
- `gallery` (avec un "y") : allow read if true — collection fantome, non utilisee par le code actuel (le code utilise `galerie`).
- Aucun index composite deploye (aucun n'est requis : les requetes n'utilisent que des egalites).

## 7. Conventions
- camelCase JS, statuts Firestore en francais sans accent ("annule", "refuse", "desistement", "confirme", "en_attente").
- Dates : jour/mois/annee en ints, mois 0-indexe partout (piege classique — NE PAS "corriger" en 1-indexe).
- Rendu : fonctions refreshX()/renderX() qui font innerHTML sur des conteneurs par id.
- Commits : francais, prefixes feat/fix/chore, auteur ninetechnologies@outlook.fr obligatoire (Vercel).

## 8. Drift prod/local
Aucun. HEAD local = origin/main = 6e756ca.

## 10. Diagnostic des 5 bugs signales (26/07/2026)

| # | Symptome | Cause | Localisation |
|---|----------|-------|--------------|
| 1 | Jours bloques invisibles cote cliente + reservables | Rules : pas de regle read sur `blocked` → permission-denied ; listener sans handler d'erreur meurt en silence (index.html:2519) ; garde-fou resa fail-open en cas d'erreur de lecture (index.html:2720) | rules + index.html:2519, 2720 |
| 2 | Annulation non repercutee | Filtre d'affichage cliente ne masque que "annule"/"refuse", pas "desistement" (index.html:4024, idem vues admin 2668, 2833, 3042, 3121). Latent (0 desistement en base) mais bouton actif. Aucun badge "Annule" nulle part : un RDV annule disparait au lieu d'etre marque | index.html:4024 et al. |
| 3 | RDV non affiches | Requete cliente = where uid == auth.uid (index.html:2508). RDV ajoute manuellement par Marion sur une fiche "fantome" (race d'inscription documentee lignes 2236, 4298) porte un uid qui n'est pas l'uid de connexion → invisible cliente, visible admin. + onSnapshot sans callback d'erreur = echec silencieux | index.html:2504-2517, 4725 |
| 4 | Points fidelite qui disparaissent | Pas de solde stocke : tampons = count(rdvs confirmes passes + offset) % 5 (index.html:4089). Au 5e RDV le modulo raffiche "0/5" (percu comme perte). Annuler/desister un RDV PASSE retire retroactivement un tampon. Flash a 0 avant le premier snapshot | index.html:4087-4144, 4865 |
| 5 | Interface qui disparait | Fonctions de rendu font innerHTML="" puis reconstruisent, sans try/catch, rappelees a chaque snapshot → un throw = ecran vide. Service worker cache toute reponse sans test res.ok (service-worker.js:36) → une 502/504 Vercel peut etre cachee puis servie en fallback | index.html rendus + service-worker.js |

## 11. Regles de continuite pour la reprise
- Ne PAS toucher au format des cles `blocked` ni au mois 0-indexe.
- Ne PAS introduire de collection admins : l'admin = email en dur dans les rules ET dans le code.
- Toute modif des rules : creer `firestore.rules` DANS le repo, le declarer dans firebase.json, deployer via CLI — fin de la gestion console a la main.
- Bump CACHE_NAME du service worker a chaque deploiement qui touche index.html.
- Tester sur iPhone Safari reel avant de considerer livre (regle Nine Tech).

## 12. Zones sensibles
- index.html est LE fichier de prod : pas de build, pas de lint, une erreur de syntaxe = app morte pour toutes les clientes.
- L'apercu espace cliente de Marion (enterClientePreview, ligne 2441) empile des listeners `blocked` non stockes (fuite).
- Le fallback "fail-open" de la verif jour bloque (2717-2730) est un choix deliberate documente en commentaire — a conserver mais il ne doit plus jamais se declencher une fois les rules corrigees.
