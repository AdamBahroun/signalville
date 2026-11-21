const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const config = require('./config');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const reportsRoutes = require('./routes/reports');
const incidentsRoutes = require('./routes/incidents');
const categoriesRoutes = require('./routes/categories');
const meRoutes = require('./routes/me');
const swaggerUi = require('swagger-ui-express');
const openapi = require('./openapi');
const { DOSSIER: DOSSIER_PHOTOS } = require('./services/photos');
const { introuvable, gestionErreurs } = require('./middleware/erreurs');

const app = express();
app.disable('x-powered-by');
// upgrade-insecure-requests est retiré de la politique par défaut : l'API est servie en http en local, et certains navigateurs
// (Safari) tentent alors de charger les fichiers de Swagger UI en https, ce qui échoue. Derrière un vrai HTTPS, le remettre.
app.use(helmet({ contentSecurityPolicy: { useDefaults: true, directives: { 'upgrade-insecure-requests': null } } }));
// Lecture du JSON des requêtes, limitée à 10 Ko.
app.use(express.json({ limit: '10kb' }));

// GET /health : l'API répond et la base est connectée (S1.1)
app.get('/health', (_req, res) => {
  const baseConnectee = mongoose.connection.readyState === 1;
  res.status(baseConnectee ? 200 : 503).json({ statut: baseConnectee ? 'ok' : 'degrade', baseDeDonnees: baseConnectee ? 'connectee' : 'deconnectee' });
});

// Limitation du nombre de requêtes sur l'authentification (exigence de sécurité, section 8 du cahier des charges).
app.use(
  '/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => config.enTest,
    message: { erreur: 'Trop de requêtes, réessaie dans quelques minutes.' },
  })
);

// Limitation des requêtes sur les routes métier (une session d'administration est bien plus bavarde que l'authentification).
app.use(
  ['/admin', '/reports', '/incidents', '/categories', '/me'],
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => config.enTest,
    message: { erreur: 'Trop de requêtes, réessaie dans quelques minutes.' },
  })
);

// Routes publiques d'inscription et de connexion.
app.use('/auth', authRoutes);
// Routes réservées à l'administrateur (rôle agent).
app.use('/admin', adminRoutes);
// Création des signalements (citoyen).
app.use('/reports', reportsRoutes);
// Incidents proches et confirmation « moi aussi » (citoyen).
app.use('/incidents', incidentsRoutes);
// Liste des catégories (citoyen).
app.use('/categories', categoriesRoutes);
// Suivi des signalements et jeton d'appareil du citoyen connecté.
app.use('/me', meRoutes);

// Photos des signalements. Helmet bloque par défaut le chargement d'une image par un autre site (CORP same-origin) :
// on l'autorise ici, car l'application mobile et le site d'administration affichent ces photos.
// dotfiles refusés, pas de liste de dossier, pas de redirection : on sert uniquement les fichiers qu'on a écrits.
app.use(
  '/uploads',
  (_req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(DOSSIER_PHOTOS, { dotfiles: 'deny', index: false, redirect: false, maxAge: '7d', immutable: true })
);

// Documentation interactive de l'API (Swagger UI) : http://localhost:3000/docs
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'API TuniIns' }));

// Route inconnue : réponse 404 en JSON.
app.use(introuvable);
// Gestionnaire d'erreurs final : transforme toute erreur en réponse JSON.
app.use(gestionErreurs);

module.exports = app;
