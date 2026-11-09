package com.example.tuniins;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import com.example.tuniins.api.ApiClient;
import com.example.tuniins.api.ErreurUtil;
import com.example.tuniins.api.LoginRequest;
import com.example.tuniins.api.LoginResponse;
import com.example.tuniins.api.SessionManager;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class AuthentificationActivity extends AppCompatActivity {
    private EditText champEmail, champMotDePasse;
    private Button boutonConnexion;
    private ProgressBar progression;
    private TextView texteErreur;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Déjà connecté : on passe directement à l'accueil.
        if (new SessionManager(this).estConnecte()) {
            ouvrirAccueil();
            return;
        }

        setContentView(R.layout.activity_authentification);
        champEmail = findViewById(R.id.champEmail);
        champMotDePasse = findViewById(R.id.champMotDePasse);
        boutonConnexion = findViewById(R.id.boutonConnexion);
        progression = findViewById(R.id.progression);
        texteErreur = findViewById(R.id.texteErreur);

        boutonConnexion.setOnClickListener(v -> connecter());
        findViewById(R.id.texteInscription).setOnClickListener(v -> startActivity(new Intent(this, InscriptionActivity.class)));
    }

    private void connecter() {
        String email = champEmail.getText().toString().trim();
        String motDePasse = champMotDePasse.getText().toString();
        if (email.isEmpty() || motDePasse.isEmpty()) {
            afficherErreur("Email et mot de passe obligatoires.");
            return;
        }
        enCours(true);
        ApiClient.get(this).connecter(new LoginRequest(email, motDePasse)).enqueue(new Callback<LoginResponse>() {
            @Override
            public void onResponse(Call<LoginResponse> appel, Response<LoginResponse> reponse) {
                if (isFinishing()) return;
                enCours(false);
                if (reponse.isSuccessful() && reponse.body() != null) {
                    LoginResponse corps = reponse.body();
                    if (!"citoyen".equals(corps.role)) {
                        afficherErreur("Ce compte est réservé au site web d'administration.");
                        return;
                    }
                    String nom = corps.utilisateur != null ? corps.utilisateur.nom : "";
                    new SessionManager(AuthentificationActivity.this).ouvrir(corps.jeton, corps.role, nom);
                    ouvrirAccueil();
                } else {
                    afficherErreur(ErreurUtil.message(reponse));
                }
            }

            @Override
            public void onFailure(Call<LoginResponse> appel, Throwable erreur) {
                if (isFinishing()) return;
                enCours(false);
                afficherErreur("Impossible de joindre le serveur. Vérifie la connexion et l'adresse de l'API.");
            }
        });
    }

    private void enCours(boolean actif) {
        progression.setVisibility(actif ? View.VISIBLE : View.GONE);
        boutonConnexion.setEnabled(!actif);
        if (actif) texteErreur.setVisibility(View.GONE);
    }

    private void afficherErreur(String message) {
        texteErreur.setText(message);
        texteErreur.setVisibility(View.VISIBLE);
    }

    private void ouvrirAccueil() {
        startActivity(new Intent(this, AccueilActivity.class));
        finish();
    }
}
