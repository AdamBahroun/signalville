package com.example.tuniins;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.example.tuniins.outils.NotificationsUtil;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

// S4.1 : reçoit les messages Firebase et affiche la notification de changement de statut.
public class NotificationsService extends FirebaseMessagingService {
    // Firebase attribue un nouveau jeton à l'appareil : on le transmet à l'API si un citoyen est connecté.
    @Override
    public void onNewToken(@NonNull String jeton) {
        NotificationsUtil.envoyerJeton(getApplicationContext(), jeton);
    }

    // Message de données : l'API n'envoie que la catégorie et le nouveau statut (jamais d'agent ni de score).
    @SuppressLint("MissingPermission") // la permission POST_NOTIFICATIONS est vérifiée juste avant
    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        String categorie = message.getData().get("categorie");
        String statut = message.getData().get("statut");
        if (categorie == null || statut == null) return;
        // Android 13 et plus : sans l'autorisation de l'utilisateur, on n'affiche rien.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        creerCanal();

        // Un toucher sur la notification ouvre « Mes signalements » (retour à la connexion si la session a expiré).
        Intent intent = new Intent(this, MesSignalementsActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent ouvrir = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification notification = new NotificationCompat.Builder(this, NotificationsUtil.CANAL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(categorie)
                .setContentText("Nouveau statut : " + statut)
                .setContentIntent(ouvrir)
                .setAutoCancel(true)
                .build();
        NotificationManagerCompat.from(this).notify((int) (System.currentTimeMillis() % Integer.MAX_VALUE), notification);
    }

    // Android 8 et plus : toute notification doit appartenir à un canal.
    private void creerCanal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel canal = new NotificationChannel(NotificationsUtil.CANAL_ID, "Changements de statut", NotificationManager.IMPORTANCE_DEFAULT);
        getSystemService(NotificationManager.class).createNotificationChannel(canal);
    }
}
