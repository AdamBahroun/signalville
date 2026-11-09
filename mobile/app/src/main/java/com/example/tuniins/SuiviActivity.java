package com.example.tuniins;

import android.os.Bundle;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.example.tuniins.api.Changement;
import com.example.tuniins.api.IncidentSuivi;
import com.example.tuniins.api.MonSignalement;
import com.example.tuniins.outils.FormatUtil;
import com.google.gson.Gson;

// S3.6 : suivi d'un signalement. Le détail est passé par l'écran précédent (aucun nouvel appel réseau).
public class SuiviActivity extends ActiviteProtegee {
    public static final String EXTRA_SIGNALEMENT = "signalement";

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

    private int dp(int valeur) {
        return Math.round(valeur * getResources().getDisplayMetrics().density);
    }
}
