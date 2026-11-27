#!/usr/bin/env bash
# Contrôle du projet signalville.
# Usage : scripts/verifier.sh [URL_API]
#   sans argument : contrôles du dépôt (fichiers requis, aucun secret suivi par Git)
#   avec URL_API  : ajoute le contrôle de santé GET <URL_API>/health (attend jusqu'à 30 s)
# Code de sortie : 0 si tous les contrôles passent, 1 si au moins un échoue.

# Pas de "set -e" volontairement : on veut exécuter tous les contrôles et les compter,
# pas s'arrêter au premier échec.
set -u

cd "$(dirname "$0")/.." || exit 1

erreurs=0
ok()    { echo "[OK]    $1"; }
echec() { echo "[ECHEC] $1"; erreurs=$((erreurs + 1)); }

# 1. Fichiers requis
for f in api/package.json api/package-lock.json api/.env.example; do
  if [ -f "$f" ]; then ok "fichier présent : $f"; else echec "fichier manquant : $f"; fi
done

# 2. Aucun fichier .env suivi par Git (le .env.example est autorisé)
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echec "ce dossier n'est pas un dépôt Git"
else
  suivis=$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$')
  if [ -z "$suivis" ]; then ok "aucun fichier .env suivi par Git"; else echec "fichier(s) .env suivi(s) par Git : $suivis"; fi
fi

# 3. Le .env.example ne contient que des noms de variables, aucune valeur
if grep -qE '^[^#]*=.+' api/.env.example 2>/dev/null; then
  echec "api/.env.example contient une valeur (seuls les noms sont autorisés)"
else
  ok "api/.env.example ne contient aucune valeur"
fi

# 4. Contrôle de santé de l'API (seulement si une URL est donnée)
if [ $# -ge 1 ]; then
  url="${1%/}/health"
  if ! command -v curl >/dev/null 2>&1; then
    echec "curl n'est pas installé"
  else
    sante=0
    for _ in $(seq 1 15); do
      # -f : un code HTTP 400 ou plus (dont le 503 de /health) fait échouer curl
      if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then sante=1; break; fi
      sleep 2
    done
    if [ "$sante" -eq 1 ]; then ok "santé : $url répond 200"; else echec "santé : $url ne répond pas 200 après 30 s"; fi
  fi
fi

echo
if [ "$erreurs" -eq 0 ]; then
  echo "Tous les contrôles sont passés."
  exit 0
fi
echo "$erreurs contrôle(s) en échec."
exit 1