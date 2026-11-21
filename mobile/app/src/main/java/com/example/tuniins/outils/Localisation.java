package com.example.tuniins.outils;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.ContextCompat;

// Position du téléphone avec le service de localisation d'Android (sans dépendance à Google Play Services).
public final class Localisation {
    // Reçoit le résultat d'une demande de position, toujours sur le thread principal.
    public interface Ecouteur {
        void surPosition(Location position);

        void surErreur(String message);
    }

    private static final long DELAI_MS = 20000; // au-delà, on abandonne et on propose de choisir sur la carte
    private static final long AGE_MAX_MS = 2 * 60 * 1000; // une position connue de moins de 2 minutes est réutilisée

    private Localisation() {}

    // Vrai si la permission de localisation (précise ou approximative) est accordée.
    public static boolean permissionAccordee(Context contexte) {
        return ContextCompat.checkSelfPermission(contexte, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(contexte, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    // À appeler depuis le thread principal. L'écouteur est toujours appelé sur le thread principal.
    @SuppressLint("MissingPermission") // la permission est vérifiée juste en dessous
    @SuppressWarnings("deprecation") // requestSingleUpdate est dépréciée depuis Android 11 mais fonctionne sur toutes les versions visées
    public static void demander(Context contexte, final Ecouteur ecouteur) {
        if (!permissionAccordee(contexte)) {
            ecouteur.surErreur("Permission de localisation refusée.");
            return;
        }
        final LocationManager gestionnaire = (LocationManager) contexte.getSystemService(Context.LOCATION_SERVICE);
        boolean precis = ContextCompat.checkSelfPermission(contexte, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean gps = precis && gestionnaire.isProviderEnabled(LocationManager.GPS_PROVIDER);
        boolean reseau = gestionnaire.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        if (!gps && !reseau) {
            ecouteur.surErreur("La localisation est désactivée sur le téléphone. Active-la, ou choisis la position sur la carte.");
            return;
        }

        try {
            Location recente = null;
            if (gps) recente = plusRecente(recente, gestionnaire.getLastKnownLocation(LocationManager.GPS_PROVIDER));
            if (reseau) recente = plusRecente(recente, gestionnaire.getLastKnownLocation(LocationManager.NETWORK_PROVIDER));
            if (recente != null) {
                ecouteur.surPosition(recente);
                return;
            }

            final Handler delai = new Handler(Looper.getMainLooper());
            final boolean[] termine = {false};
            final LocationListener ecoute = new LocationListener() {
                // Première position reçue : on arrête l'attente et on la transmet.
                @Override
                public void onLocationChanged(Location position) {
                    if (termine[0]) return;
                    termine[0] = true;
                    delai.removeCallbacksAndMessages(null);
                    ecouteur.surPosition(position);
                }

                // Obligatoires sur les versions d'Android antérieures à la 11 : on ne s'en sert pas.
                public void onStatusChanged(String fournisseur, int statut, Bundle extras) {}

                public void onProviderEnabled(String fournisseur) {}

                public void onProviderDisabled(String fournisseur) {}
            };
            gestionnaire.requestSingleUpdate(gps ? LocationManager.GPS_PROVIDER : LocationManager.NETWORK_PROVIDER, ecoute, Looper.getMainLooper());
            delai.postDelayed(() -> {
                if (termine[0]) return;
                termine[0] = true;
                gestionnaire.removeUpdates(ecoute);
                ecouteur.surErreur("Position introuvable pour le moment. Sors à l'extérieur, ou choisis la position sur la carte.");
            }, DELAI_MS);
        } catch (SecurityException e) {
            ecouteur.surErreur("Permission de localisation refusée.");
        }
    }

    // Garde la position la plus récente, en ignorant celles trop anciennes.
    private static Location plusRecente(Location actuelle, Location candidate) {
        if (candidate == null || System.currentTimeMillis() - candidate.getTime() > AGE_MAX_MS) return actuelle;
        return actuelle == null || candidate.getTime() > actuelle.getTime() ? candidate : actuelle;
    }
}
