package com.example.tuniins.outils;

import android.content.Context;
import com.example.tuniins.api.ApiClient;
import com.example.tuniins.api.JetonAppareilRequest;
import com.example.tuniins.api.SessionManager;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

// S4.1 : notifications Firebase, entièrement facultatives. Sans google-services.json au build, rien ne s'active.
public final class NotificationsUtil {
    public static final String CANAL_ID = "statuts"; // canal Android des notifications de changement de statut

    private NotificationsUtil() {}

    // Sans google-services.json, aucune FirebaseApp n'existe : on n'appelle alors jamais FirebaseMessaging (il lèverait une exception).
    public static boolean firebaseDisponible(Context contexte) {
        return !FirebaseApp.getApps(contexte.getApplicationContext()).isEmpty();
    }

    // Récupère le jeton de l'appareil auprès de Firebase puis l'envoie à l'API.
    public static void enregistrerJeton(Context contexte) {
        if (!firebaseDisponible(contexte)) return;
        final Context app = contexte.getApplicationContext();
        FirebaseMessaging.getInstance().getToken().addOnSuccessListener(jeton -> envoyerJeton(app, jeton));
    }

    // Envoie le jeton à l'API (POST /me/device-token), seulement si un citoyen est connecté.
    public static void envoyerJeton(Context contexte, String jeton) {
        final Context app = contexte.getApplicationContext();
        if (jeton == null || jeton.isEmpty() || !new SessionManager(app).estConnecte()) return;
        ApiClient.get(app).enregistrerAppareil(new JetonAppareilRequest(jeton)).enqueue(new Callback<Void>() {
            // Succès ou refus ignorés : l'envoi sera retenté à la prochaine ouverture de l'accueil.
            @Override
            public void onResponse(Call<Void> appel, Response<Void> reponse) {
                // Rien à afficher : l'envoi sera retenté à la prochaine ouverture de l'accueil.
            }

            // Échec réseau ignoré : les notifications sont facultatives.
            @Override
            public void onFailure(Call<Void> appel, Throwable erreur) {
                // Idem : les notifications sont facultatives, un échec réseau ne gêne pas l'utilisateur.
            }
        });
    }
}
