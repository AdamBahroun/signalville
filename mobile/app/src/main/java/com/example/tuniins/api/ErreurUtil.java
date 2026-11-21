package com.example.tuniins.api;

import com.google.gson.Gson;
import java.io.IOException;
import java.net.SocketTimeoutException;
import retrofit2.Response;

// Transforme les erreurs de l'API ou du réseau en messages lisibles.
public class ErreurUtil {
    // Message clair quand l'appel n'a pas abouti : réponse trop lente, serveur injoignable ou réponse illisible.
    public static String reseau(Throwable erreur) {
        if (erreur instanceof SocketTimeoutException) return "Le serveur met trop de temps à répondre. Réessaie dans un instant.";
        if (erreur instanceof IOException) return "Impossible de joindre le serveur. Vérifie ta connexion Internet et que l'API est lancée.";
        return "Réponse inattendue du serveur. Réessaie plus tard.";
    }

    // Message d'erreur renvoyé par l'API (premier détail ou champ erreur), sinon « Erreur » suivi du code HTTP.
    public static String message(Response<?> reponse) {
        try {
            ErreurApi e = new Gson().fromJson(reponse.errorBody().string(), ErreurApi.class);
            if (e != null && e.details != null && !e.details.isEmpty()) return e.details.values().iterator().next();
            if (e != null && e.erreur != null) return e.erreur;
        } catch (Exception ignore) {
            // corps absent ou illisible : message générique ci-dessous
        }
        return "Erreur " + reponse.code();
    }
}
