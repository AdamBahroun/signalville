package com.example.tuniins;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.widget.TextView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import com.example.tuniins.outils.NotificationsUtil;

// Menu principal du citoyen. S4.1 : prépare aussi les notifications (autorisation et jeton d'appareil).
public class AccueilActivity extends ActiviteProtegee {
    // Android 13 et plus : l'autorisation d'afficher des notifications se demande à l'exécution (le refus n'a pas de suite ici).
    private final ActivityResultLauncher<String> demandeNotifications = registerForActivityResult(new ActivityResultContracts.RequestPermission(), accorde -> { });

    // Affiche le menu du citoyen et ses boutons de navigation.
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
        preparerNotifications();
    }

    // Sans google-services.json (Firebase non configuré), rien n'est demandé ni envoyé.
    private void preparerNotifications() {
        if (!NotificationsUtil.firebaseDisponible(this)) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            demandeNotifications.launch(Manifest.permission.POST_NOTIFICATIONS);
        }
        NotificationsUtil.enregistrerJeton(this); // envoie le jeton à l'API après la connexion
    }
}
