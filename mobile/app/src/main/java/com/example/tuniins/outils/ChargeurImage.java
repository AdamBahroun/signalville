package com.example.tuniins.outils;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import com.example.tuniins.api.ApiConfig;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// S4.5 : télécharge une photo du serveur sans bibliothèque externe (HttpURLConnection et BitmapFactory).
public final class ChargeurImage {
    // Résultat toujours rendu sur le thread principal.
    public interface Ecouteur {
        void surImage(Bitmap image);

        void surEchec();
    }

    private static final int LARGEUR_MAX = 1024; // la photo est réduite pour économiser la mémoire
    private static final int TAILLE_MAX_OCTETS = 10 * 1024 * 1024; // au-delà, on abandonne
    private static final ExecutorService FIL = Executors.newSingleThreadExecutor(); // un seul téléchargement à la fois
    private static final Handler PRINCIPAL = new Handler(Looper.getMainLooper());

    private ChargeurImage() {}

    // Télécharge en arrière-plan puis appelle l'écouteur sur le thread principal.
    public static void charger(String photoUrl, final Ecouteur ecouteur) {
        final String adresse = adresse(photoUrl);
        FIL.execute(() -> {
            Bitmap image;
            try {
                image = telecharger(adresse);
            } catch (IOException | RuntimeException e) {
                image = null; // réseau coupé ou image illisible : l'écran affichera un message
            }
            final Bitmap resultat = image;
            PRINCIPAL.post(() -> {
                if (resultat != null) ecouteur.surImage(resultat);
                else ecouteur.surEchec();
            });
        });
    }

    // L'API renvoie un chemin relatif (/uploads/nom.jpg) : on le complète avec l'adresse de l'API.
    private static String adresse(String photoUrl) {
        if (photoUrl.startsWith("http")) return photoUrl;
        String base = ApiConfig.BASE_URL;
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        return base + (photoUrl.startsWith("/") ? "" : "/") + photoUrl;
    }

    // Télécharge l'image (200 attendu) et la décode réduite ; null si le serveur refuse ou si elle est trop lourde.
    private static Bitmap telecharger(String adresse) throws IOException {
        HttpURLConnection connexion = (HttpURLConnection) new URL(adresse).openConnection();
        connexion.setConnectTimeout(10000);
        connexion.setReadTimeout(20000);
        try {
            if (connexion.getResponseCode() != 200) return null;
            ByteArrayOutputStream tampon = new ByteArrayOutputStream();
            byte[] bloc = new byte[8192];
            try (InputStream flux = connexion.getInputStream()) {
                int lu;
                while ((lu = flux.read(bloc)) != -1) {
                    tampon.write(bloc, 0, lu);
                    if (tampon.size() > TAILLE_MAX_OCTETS) return null;
                }
            }
            byte[] octets = tampon.toByteArray();
            // Première lecture : seulement les dimensions, pour choisir le facteur de réduction.
            BitmapFactory.Options mesure = new BitmapFactory.Options();
            mesure.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(octets, 0, octets.length, mesure);
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = Math.max(1, mesure.outWidth / LARGEUR_MAX);
            return BitmapFactory.decodeByteArray(octets, 0, octets.length, options);
        } finally {
            connexion.disconnect();
        }
    }
}
