package com.example.tuniins.outils;

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.preference.PreferenceManager;
import java.io.File;
import org.osmdroid.config.Configuration;
import org.osmdroid.tileprovider.tilesource.OnlineTileSourceBase;
import org.osmdroid.tileprovider.tilesource.XYTileSource;
import org.osmdroid.util.GeoPoint;
import org.osmdroid.views.MapView;

// Réglages communs des cartes osmdroid : centre de Nabeul, tuiles, zone de la commune.
public final class OutilsCarte {
    // Centre de la commune par défaut (Nabeul). Le contrôle de zone (RG9) reste fait par l'API.
    public static final double CENTRE_LAT = 36.4513;
    public static final double CENTRE_LNG = 10.7357;
    // Au-delà de cette distance du centre, on considère que le téléphone est hors de la commune (émulateur en Californie, par exemple).
    public static final float RAYON_COMMUNE_M = 20000f;

    // Tuiles OpenStreetMap France (100% gratuites, stables et très rapides)
    public static final OnlineTileSourceBase TUILES_OSM_FR = new XYTileSource(
            "OSM_FR",
            0, 19, 256, ".png",
            new String[]{
                    "https://a.tile.openstreetmap.fr/osmfr/",
                    "https://b.tile.openstreetmap.fr/osmfr/",
                    "https://c.tile.openstreetmap.fr/osmfr/"
            }
    );

    private OutilsCarte() {}

    // À appeler AVANT setContentView / l'inflate du MapView dans les activités (ex: CarteActivity, ChoixPositionActivity)
    @SuppressWarnings("deprecation")
    public static void initialiser(Context contexte) {
        Context appContexte = contexte.getApplicationContext();

        // 1. Charger la configuration osmdroid depuis les SharedPreferences
        Configuration.getInstance().load(appContexte, PreferenceManager.getDefaultSharedPreferences(appContexte));

        // 2. Définir un User-Agent valide SANS "com.example" (OpenStreetMap bloque automatiquement les requêtes contenant "com.example")
        String userAgent = "TuniIns/1.0 (projet étudiant, ISET Nabeul)";
        Configuration.getInstance().setUserAgentValue(userAgent);
        Configuration.getInstance().getAdditionalHttpRequestProperties().put("User-Agent", userAgent);

        // 3. Configurer un cache de tuiles valide dans le stockage interne privé de l'application
        File osmdroidBase = new File(appContexte.getCacheDir(), "osmdroid");
        File osmdroidTileCache = new File(osmdroidBase, "tiles");
        Configuration.getInstance().setOsmdroidBasePath(osmdroidBase);
        Configuration.getInstance().setOsmdroidTileCache(osmdroidTileCache);

        // 4. Vider le cache osmdroid si des réponses 403 y ont été stockées précédemment
        supprimerDossier(osmdroidTileCache);

        // 5. Sauvegarder la nouvelle configuration
        Configuration.getInstance().save(appContexte, PreferenceManager.getDefaultSharedPreferences(appContexte));
    }

    // Règle la source de tuiles, le zoom et le centre d'une carte.
    public static void configurer(MapView carte, double lat, double lng, double zoom) {
        carte.setTileSource(TUILES_OSM_FR);
        carte.setMultiTouchControls(true);
        carte.getController().setZoom(zoom);
        carte.getController().setCenter(new GeoPoint(lat, lng));
    }

    // Repère rond de la couleur du statut (orange nouveau, bleu pris en charge), à poser avec ANCHOR_CENTER.
    public static Drawable pastille(Context contexte, int couleur) {
        int taille = Math.round(26 * contexte.getResources().getDisplayMetrics().density);
        GradientDrawable rond = new GradientDrawable();
        rond.setShape(GradientDrawable.OVAL);
        rond.setColor(couleur);
        rond.setStroke(Math.max(2, taille / 10), Color.WHITE);
        rond.setSize(taille, taille);
        return rond;
    }

    // Vrai si la position est dans le rayon de la commune autour de Nabeul.
    public static boolean dansLaCommune(double lat, double lng) {
        float[] resultat = new float[1];
        android.location.Location.distanceBetween(CENTRE_LAT, CENTRE_LNG, lat, lng, resultat);
        return resultat[0] <= RAYON_COMMUNE_M;
    }

    // Supprime récursivement le contenu d'un dossier (cache de tuiles).
    private static void supprimerDossier(File dossier) {
        if (dossier != null && dossier.exists() && dossier.isDirectory()) {
            File[] fichiers = dossier.listFiles();
            if (fichiers != null) {
                for (File f : fichiers) {
                    if (f.isDirectory()) supprimerDossier(f);
                    else {
                        boolean ignore = f.delete();
                    }
                }
            }
        }
    }
}
