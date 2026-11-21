package com.example.tuniins;

import android.graphics.Bitmap;
import android.os.Bundle;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.example.tuniins.api.Changement;
import com.example.tuniins.api.IncidentSuivi;
import com.example.tuniins.api.MonSignalement;
import com.example.tuniins.outils.ChargeurImage;
import com.example.tuniins.outils.FormatUtil;
import com.google.gson.Gson;

// S3.6 : suivi d'un signalement (détail passé par l'écran précédent). S4.5 : sa photo, téléchargée à part.
public class SuiviActivity extends ActiviteProtegee {
    public static final String EXTRA_SIGNALEMENT = "signalement";

    // Affiche le signalement reçu de la liste : statut, compteurs, photo et historique.
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (isFinishing()) return;
        setContentView(R.layout.activity_suivi);
        appliquerInsets(findViewById(R.id.racine));

        MonSignalement s = null;
        String json = getIntent().getStringExtra(EXTRA_SIGNALEMENT);
        if (json != null) s = new Gson().fromJson(json, MonSignalement.class);
        if (s == null) { // ne devrait pas arriver : l'écran est toujours ouvert depuis la liste
            finish();
            return;
        }

        ((TextView) findViewById(R.id.suiviTitre)).setText(s.libelle);
        ((TextView) findViewById(R.id.suiviDate)).setText("Signalé le " + FormatUtil.date(s.date));
        ((TextView) findViewById(R.id.suiviDescription)).setText(s.description);
        afficherPhoto(s.photoUrl);

        TextView statut = findViewById(R.id.suiviStatut);
        TextView rejet = findViewById(R.id.suiviRejet);
        if (s.rejete) {
            statut.setText("Signalement rejeté");
            statut.setTextColor(FormatUtil.couleurStatut("rejete"));
            rejet.setText("Motif : " + (s.motifRejet == null || s.motifRejet.isEmpty() ? "non précisé" : s.motifRejet));
            rejet.setVisibility(View.VISIBLE);
        } else if (s.incident != null) {
            statut.setText(s.incident.libelleStatut);
            statut.setTextColor(FormatUtil.couleurStatut(s.incident.statut));
        }

        TextView compteurs = findViewById(R.id.suiviCompteurs);
        if (s.incident != null) {
            compteurs.setText(FormatUtil.pluriel(s.incident.nbSignalements, "signalement", "signalements") + " pour cet incident · "
                    + FormatUtil.pluriel(s.incident.nbPersonnes, "personne concernée", "personnes concernées"));
        } else {
            compteurs.setVisibility(View.GONE);
        }

        afficherHistorique(s.incident);
    }

    // Photo jointe au signalement (facultative) : un échec réseau n'empêche pas d'afficher le reste de l'écran.
    private void afficherPhoto(String photoUrl) {
        if (photoUrl == null || photoUrl.isEmpty()) return;
        final ImageView vue = findViewById(R.id.suiviPhoto);
        final TextView erreur = findViewById(R.id.suiviPhotoErreur);
        vue.setVisibility(View.VISIBLE);
        ChargeurImage.charger(photoUrl, new ChargeurImage.Ecouteur() {
            // Photo téléchargée : on l'affiche.
            @Override
            public void surImage(Bitmap image) {
                if (isFinishing()) return;
                vue.setImageBitmap(image);
            }

            // Photo impossible à charger : message à la place de l'image.
            @Override
            public void surEchec() {
                if (isFinishing()) return;
                vue.setVisibility(View.GONE);
                erreur.setVisibility(View.VISIBLE);
            }
        });
    }

    // Une ligne par changement de statut : le statut et la date en gras, le motif en dessous.
    private void afficherHistorique(IncidentSuivi incident) {
        LinearLayout conteneur = findViewById(R.id.conteneurHistorique);
        if (incident == null || incident.historique == null) return;
        for (Changement c : incident.historique) {
            TextView entete = new TextView(this);
            entete.setText(c.libelleStatut + " · " + FormatUtil.date(c.date));
            entete.setTextSize(15);
            entete.setTypeface(entete.getTypeface(), android.graphics.Typeface.BOLD);
            entete.setTextColor(FormatUtil.couleurStatut(c.statut));
            entete.setPadding(0, dp(12), 0, 0);
            conteneur.addView(entete);

            if (c.motif != null && !c.motif.isEmpty()) {
                TextView motif = new TextView(this);
                motif.setText(c.motif);
                motif.setTextSize(14);
                conteneur.addView(motif);
            }
        }
    }

    // Convertit des dp en pixels selon la densité de l'écran.
    private int dp(int valeur) {
        return Math.round(valeur * getResources().getDisplayMetrics().density);
    }
}
