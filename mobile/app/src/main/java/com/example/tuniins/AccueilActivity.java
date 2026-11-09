package com.example.tuniins;

import android.content.Intent;
import android.os.Bundle;
import android.widget.TextView;

public class AccueilActivity extends ActiviteProtegee {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (isFinishing()) return; // pas de jeton : ActiviteProtegee a déjà renvoyé vers la connexion
        setContentView(R.layout.activity_accueil);
        appliquerInsets(findViewById(R.id.racine));
        ((TextView) findViewById(R.id.texteBienvenue)).setText("Bonjour " + session.getNom());

        findViewById(R.id.boutonSignaler).setOnClickListener(v -> startActivity(new Intent(this, SignalementActivity.class)));
        findViewById(R.id.boutonCarte).setOnClickListener(v -> startActivity(new Intent(this, CarteActivity.class)));
        findViewById(R.id.boutonMesSignalements).setOnClickListener(v -> startActivity(new Intent(this, MesSignalementsActivity.class)));
        findViewById(R.id.boutonDeconnexion).setOnClickListener(v -> {
            session.fermer();
            startActivity(new Intent(this, AuthentificationActivity.class));
            finish();
        });
    }
}
