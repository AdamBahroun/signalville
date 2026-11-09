package com.example.tuniins;

import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import com.example.tuniins.api.ApiClient;
import com.example.tuniins.api.ErreurUtil;
import com.example.tuniins.api.InscriptionResponse;
import com.example.tuniins.api.RegisterRequest;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class InscriptionActivity extends AppCompatActivity {
    private EditText champNom, champEmail, champMotDePasse, champConfirmation;
    private Button boutonInscription;
    private ProgressBar progression;
    private TextView texteErreur;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_inscription);
        champNom = findViewById(R.id.champNom);
        champEmail = findViewById(R.id.champEmail);
        champMotDePasse = findViewById(R.id.champMotDePasse);
        champConfirmation = findViewById(R.id.champConfirmation);
        boutonInscription = findViewById(R.id.boutonInscription);
        progression = findViewById(R.id.progression);
        texteErreur = findViewById(R.id.texteErreur);
        boutonInscription.setOnClickListener(v -> inscrire());
    }

    private void inscrire() {
        String nom = champNom.getText().toString().trim();
        String email = champEmail.getText().toString().trim();
        String motDePasse = champMotDePasse.getText().toString();

        // Contrôles de confort côté téléphone. Les vrais contrôles restent ceux de l'API.
        if (nom.length() < 2) {
            afficherErreur("Le nom doit contenir au moins 2 caractères.");
            return;
        }
        if (email.isEmpty()) {
            afficherErreur("L'email est obligatoire.");
            return;
        }
        if (motDePasse.length() < 8) {
            afficherErreur("Le mot de passe doit contenir au moins 8 caractères.");
            return;
        }
        if (!motDePasse.equals(champConfirmation.getText().toString())) {
            afficherErreur("Les deux mots de passe sont différents.");
            return;
        }

        enCours(true);
        ApiClient.get(this).inscrire(new RegisterRequest(nom, email, motDePasse)).enqueue(new Callback<InscriptionResponse>() {
            @Override
            public void onResponse(Call<InscriptionResponse> appel, Response<InscriptionResponse> reponse) {
                if (isFinishing()) return;
                enCours(false);
                if (reponse.isSuccessful()) {
                    Toast.makeText(InscriptionActivity.this, "Compte créé, connecte-toi.", Toast.LENGTH_LONG).show();
                    finish(); // retour à l'écran de connexion
                } else {
                    afficherErreur(ErreurUtil.message(reponse)); // 400 (champ invalide) ou 409 (email déjà utilisé)
                }
            }

            @Override
            public void onFailure(Call<InscriptionResponse> appel, Throwable erreur) {
                if (isFinishing()) return;
                enCours(false);
                afficherErreur("Impossible de joindre le serveur. Vérifie la connexion et l'adresse de l'API.");
            }
        });
    }

    private void enCours(boolean actif) {
        progression.setVisibility(actif ? View.VISIBLE : View.GONE);
        boutonInscription.setEnabled(!actif);
        if (actif) texteErreur.setVisibility(View.GONE);
    }

    private void afficherErreur(String message) {
        texteErreur.setText(message);
        texteErreur.setVisibility(View.VISIBLE);
    }
}
