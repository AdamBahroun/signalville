package com.example.tuniins;

import android.Manifest;
import android.location.Location;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import com.example.tuniins.api.ApiClient;
import com.example.tuniins.api.ConfirmationResponse;
import com.example.tuniins.api.ErreurUtil;
import com.example.tuniins.api.IncidentProche;
import com.example.tuniins.api.IncidentsResponse;
import com.example.tuniins.outils.FormatUtil;
import com.example.tuniins.outils.Localisation;
import com.example.tuniins.outils.OutilsCarte;
import java.util.ArrayList;
import java.util.List;
import org.osmdroid.api.IGeoPoint;
import org.osmdroid.events.MapEventsReceiver;
import org.osmdroid.util.GeoPoint;
import org.osmdroid.views.MapView;
import org.osmdroid.views.overlay.MapEventsOverlay;
import org.osmdroid.views.overlay.Marker;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

// S3.4 : carte des incidents ouverts autour de moi. S3.5 : « moi aussi » sur un incident (RG5).
public class CarteActivity extends ActiviteProtegee {
    private static final int RAYON_METRES = 5000; // maximum accepté par l'API

    private MapView carte;
    private Button boutonActualiser, boutonMoiAussi;
    private View panneau;
    private TextView panneauTitre, panneauDetail, panneauErreur;
    private final List<Marker> reperes = new ArrayList<>();
    private IncidentProche selection;

    private final ActivityResultLauncher<String[]> demandePermission = registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(), resultats -> centrerSurMaPosition());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (isFinishing()) return;
        OutilsCarte.initialiser(this); // avant setContentView
        setContentView(R.layout.activity_carte);
        appliquerInsets(findViewById(R.id.racine));

        carte = findViewById(R.id.carte);
        boutonActualiser = findViewById(R.id.boutonActualiser);
        boutonMoiAussi = findViewById(R.id.boutonMoiAussi);
        panneau = findViewById(R.id.panneau);
        panneauTitre = findViewById(R.id.panneauTitre);
        panneauDetail = findViewById(R.id.panneauDetail);
        panneauErreur = findViewById(R.id.panneauErreur);

        OutilsCarte.configurer(carte, OutilsCarte.CENTRE_LAT, OutilsCarte.CENTRE_LNG, 15.0);
        // Un toucher sur la carte (hors d'un repère) referme le panneau.
        carte.getOverlays().add(0, new MapEventsOverlay(new MapEventsReceiver() {
            @Override
            public boolean singleTapConfirmedHelper(GeoPoint point) {
                panneau.setVisibility(View.GONE);
                selection = null;
                return false;
            }

            @Override
            public boolean longPressHelper(GeoPoint point) {
                return false;
            }
        }));

        boutonActualiser.setOnClickListener(v -> {
            IGeoPoint centre = carte.getMapCenter();
            charger(centre.getLatitude(), centre.getLongitude());
        });
        boutonMoiAussi.setOnClickListener(v -> confirmer());

        if (Localisation.permissionAccordee(this)) centrerSurMaPosition();
        else demandePermission.launch(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION});
    }

    // Centre la carte sur le téléphone s'il est dans la commune ; sinon (permission refusée, GPS absent, émulateur à l'étranger) sur Nabeul.
    private void centrerSurMaPosition() {
        if (!Localisation.permissionAccordee(this)) {
            charger(OutilsCarte.CENTRE_LAT, OutilsCarte.CENTRE_LNG);
            return;
        }
        Localisation.demander(this, new Localisation.Ecouteur() {
            @Override
            public void surPosition(Location position) {
                if (isFinishing()) return;
                if (OutilsCarte.dansLaCommune(position.getLatitude(), position.getLongitude())) {
                    carte.getController().setCenter(new GeoPoint(position.getLatitude(), position.getLongitude()));
                    charger(position.getLatitude(), position.getLongitude());
                } else {
                    Toast.makeText(CarteActivity.this, "Tu es hors de la zone de la commune : carte centrée sur Nabeul.", Toast.LENGTH_LONG).show();
                    charger(OutilsCarte.CENTRE_LAT, OutilsCarte.CENTRE_LNG);
                }
            }

            @Override
            public void surErreur(String message) {
                if (isFinishing()) return;
                charger(OutilsCarte.CENTRE_LAT, OutilsCarte.CENTRE_LNG);
            }
        });
    }

    // ------------------------------------------------------------------ Incidents

    private void charger(double lat, double lng) {
        boutonActualiser.setEnabled(false);
        ApiClient.get(this).incidentsProches(FormatUtil.coordonnee(lat), FormatUtil.coordonnee(lng), RAYON_METRES).enqueue(new Callback<IncidentsResponse>() {
            @Override
            public void onResponse(Call<IncidentsResponse> appel, Response<IncidentsResponse> reponse) {
                if (isFinishing()) return;
                if (sessionExpiree(reponse)) return;
                boutonActualiser.setEnabled(true);
                if (reponse.isSuccessful() && reponse.body() != null && reponse.body().incidents != null) {
                    afficherReperes(reponse.body().incidents);
                } else {
                    Toast.makeText(CarteActivity.this, ErreurUtil.message(reponse), Toast.LENGTH_LONG).show();
                }
            }

            @Override
            public void onFailure(Call<IncidentsResponse> appel, Throwable erreur) {
                if (isFinishing()) return;
                boutonActualiser.setEnabled(true);
                Toast.makeText(CarteActivity.this, "Impossible de joindre le serveur. Vérifie la connexion.", Toast.LENGTH_LONG).show();
            }
        });
    }

    private void afficherReperes(List<IncidentProche> incidents) {
        carte.getOverlays().removeAll(reperes);
        reperes.clear();
        panneau.setVisibility(View.GONE);
        selection = null;
        for (final IncidentProche incident : incidents) {
            Marker repere = new Marker(carte);
            repere.setPosition(new GeoPoint(incident.position.lat, incident.position.lng));
            repere.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM);
            repere.setTitle(incident.libelle);
            repere.setOnMarkerClickListener((marqueur, vue) -> {
                afficherPanneau(incident);
                return true;
            });
            carte.getOverlays().add(repere);
            reperes.add(repere);
        }
        carte.invalidate();
        if (incidents.isEmpty()) Toast.makeText(this, "Aucun incident ouvert dans ce rayon.", Toast.LENGTH_SHORT).show();
    }

    private void afficherPanneau(IncidentProche incident) {
        selection = incident;
        panneauTitre.setText(incident.libelle + " : " + incident.libelleStatut);
        panneauTitre.setTextColor(FormatUtil.couleurStatut(incident.statut));
        panneauDetail.setText(FormatUtil.pluriel(incident.nbSignalements, "signalement", "signalements") + " · "
                + FormatUtil.pluriel(incident.nbPersonnes, "personne concernée", "personnes concernées")
                + "\nPremier signalement : " + FormatUtil.date(incident.premierSignalement));
        panneauErreur.setVisibility(View.GONE);
        if (incident.monSignalement) {
            boutonMoiAussi.setText("Tu as signalé cet incident");
            boutonMoiAussi.setEnabled(false);
        } else if (incident.dejaConfirme) {
            boutonMoiAussi.setText("Tu as déjà confirmé");
            boutonMoiAussi.setEnabled(false);
        } else {
            boutonMoiAussi.setText("Moi aussi, je suis concerné");
            boutonMoiAussi.setEnabled(true);
        }
        panneau.setVisibility(View.VISIBLE);
    }

    private void confirmer() {
        if (selection == null) return;
        final IncidentProche incident = selection;
        boutonMoiAussi.setEnabled(false);
        panneauErreur.setVisibility(View.GONE);
        ApiClient.get(this).confirmer(incident.id).enqueue(new Callback<ConfirmationResponse>() {
            @Override
            public void onResponse(Call<ConfirmationResponse> appel, Response<ConfirmationResponse> reponse) {
                if (isFinishing()) return;
                if (sessionExpiree(reponse)) return;
                if (reponse.isSuccessful() && reponse.body() != null) {
                    incident.dejaConfirme = true;
                    incident.nbSignalements = reponse.body().nbSignalements;
                    incident.nbPersonnes = reponse.body().nbPersonnes;
                    Toast.makeText(CarteActivity.this, "Merci, ta confirmation est prise en compte.", Toast.LENGTH_SHORT).show();
                    if (selection == incident) afficherPanneau(incident);
                } else {
                    // 409 : déjà confirmé, déjà signalé, ou incident clos entre-temps. Le message vient de l'API.
                    panneauErreur.setText(ErreurUtil.message(reponse));
                    panneauErreur.setVisibility(View.VISIBLE);
                    boutonMoiAussi.setEnabled(reponse.code() != 409);
                }
            }

            @Override
            public void onFailure(Call<ConfirmationResponse> appel, Throwable erreur) {
                if (isFinishing()) return;
                panneauErreur.setText("Impossible de joindre le serveur. Réessaie.");
                panneauErreur.setVisibility(View.VISIBLE);
                boutonMoiAussi.setEnabled(true);
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (carte != null) carte.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (carte != null) carte.onPause();
    }
}
