package com.example.tuniins;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.example.tuniins.api.SessionManager;
import retrofit2.Response;

// Base des écrans réservés à un citoyen connecté.
// - Sans jeton, on revient à la connexion.
// - Quand l'API répond 401 (jeton expiré après 1 heure, compte bloqué), on referme la session et on revient à la connexion.
// Après super.onCreate, une sous-classe doit tester isFinishing() et s'arrêter si c'est vrai.
public abstract class ActiviteProtegee extends AppCompatActivity {
    protected SessionManager session;

    // Ouvre la session locale ; sans jeton enregistré, retour à la connexion.
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        session = new SessionManager(this);
        if (!session.estConnecte()) versConnexion();
    }

    // À appeler en premier dans chaque réponse de l'API. Retourne true si la session est terminée (l'écran se ferme).
    protected boolean sessionExpiree(Response<?> reponse) {
        if (reponse.code() != 401) return false;
        session.fermer();
        Toast.makeText(this, "Ta session a pris fin, reconnecte-toi.", Toast.LENGTH_LONG).show();
        versConnexion();
        return true;
    }

    // Retourne à l'écran de connexion en vidant la pile d'écrans.
    private void versConnexion() {
        Intent intent = new Intent(this, AuthentificationActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
        finish();
    }

    // L'application s'affiche sous la barre d'état et la barre de navigation (Android 15 et plus) : on décale le contenu.
    protected void appliquerInsets(View racine) {
        final int gauche = racine.getPaddingLeft();
        final int haut = racine.getPaddingTop();
        final int droite = racine.getPaddingRight();
        final int bas = racine.getPaddingBottom();
        ViewCompat.setOnApplyWindowInsetsListener(racine, (vue, insets) -> {
            Insets barres = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            vue.setPadding(gauche + barres.left, haut + barres.top, droite + barres.right, bas + barres.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
    }
}
