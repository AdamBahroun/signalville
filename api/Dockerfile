# Image de base : version exacte de Node 22 (le README exige 22.12 ou plus), jamais "latest"
FROM node:22.23.5-alpine

ENV NODE_ENV=production
WORKDIR /app

# Les dépendances d'abord : cette couche est réutilisée tant que package*.json ne change pas
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Seulement ce dont l'API a besoin pour tourner (pas de tests, pas de collections Postman)
COPY src ./src
COPY scripts ./scripts

# Dossier des photos : le seul endroit où l'API écrit, donné à l'utilisateur non root
RUN mkdir -p uploads && chown node:node uploads

# Utilisateur non root fourni par l'image Node (uid 1000)
USER node

EXPOSE 3000

# Santé = GET /health répond 200 (donc l'API tourne ET MongoDB est connecté)
# Alpine n'a pas curl : on utilise le fetch intégré à Node 22
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Forme exec, pas "npm start" : node est le processus principal et reçoit SIGTERM (arrêt propre géré dans index.js)
CMD ["node", "src/index.js"]