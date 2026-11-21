package com.example.tuniins.api;

import android.content.Context;
import android.content.SharedPreferences;

// Session locale du citoyen : jeton, rôle et nom, gardés dans les préférences de l'application.
public class SessionManager {
    private final SharedPreferences prefs;

    // Ouvre les préférences de session.
    public SessionManager(Context contexte) {
        prefs = contexte.getApplicationContext().getSharedPreferences("session", Context.MODE_PRIVATE);
    }

    // Enregistre la session après une connexion réussie.
    public void ouvrir(String jeton, String role, String nom) {
        prefs.edit().putString("jeton", jeton).putString("role", role).putString("nom", nom).apply();
    }

    public String getJeton() { return prefs.getString("jeton", null); }
    public String getNom() { return prefs.getString("nom", ""); }
    public boolean estConnecte() { return getJeton() != null; }
    public void fermer() { prefs.edit().clear().apply(); }
}
