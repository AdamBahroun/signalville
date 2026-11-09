package com.example.tuniins.api;

import android.content.Context;
import android.content.SharedPreferences;

public class SessionManager {
    private final SharedPreferences prefs;

    public SessionManager(Context contexte) {
        prefs = contexte.getApplicationContext().getSharedPreferences("session", Context.MODE_PRIVATE);
    }

    public void ouvrir(String jeton, String role, String nom) {
        prefs.edit().putString("jeton", jeton).putString("role", role).putString("nom", nom).apply();
    }

    public String getJeton() { return prefs.getString("jeton", null); }
    public String getNom() { return prefs.getString("nom", ""); }
    public boolean estConnecte() { return getJeton() != null; }
    public void fermer() { prefs.edit().clear().apply(); }
}
