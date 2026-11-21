package com.example.tuniins;

import android.Manifest;
import android.location.Location;
import android.os.Bundle;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import com.example.tuniins.api.ApiClient;
import com.example.tuniins.api.Categorie;
import com.example.tuniins.api.CategoriesResponse;
import com.example.tuniins.api.ConfirmationResponse;
import com.example.tuniins.api.ErreurUtil;
import com.example.tuniins.api.IncidentProche;
import com.example.tuniins.api.IncidentsResponse;
import com.example.tuniins.api.Position;
import com.example.tuniins.outils.FormatUtil;
import com.example.tuniins.outils.Localisation;
import com.example.tuniins.outils.OutilsCarte;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import org.osmdroid.api.IGeoPoint;
import org.osmdroid.events.MapEventsReceiver;
import org.osmdroid.util.GeoPoint;
import org.osmdroid.views.MapView;
import org.osmdroid.views.overlay.MapEventsOverlay;
import org.osmdroid.views.overlay.Marker;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

// S3.4 : carte des incidents ouverts autour de moi. S3.5 : « moi aussi » (RG5, RG10). S4.5 : filtre par catégorie et repères colorés.
public class CarteActivity extends ActiviteProtegee {
    private static final int RAYON_METRES = 5000; // maximum accepté par l'API

    // Carte osmdroid, boutons et panneau de détail de l'incident sélectionné.
    private MapView carte;
    private Button boutonActualiser, boutonMoiAussi;
    private View panneau;
    private TextView panneauTitre, panneauDetail, panneauErreur;
    // Repères actuellement posés sur la carte (retirés à chaque rechargement).
    private final List<Marker> reperes = new ArrayList<>();
    // Incident dont le panneau est ouvert, null si aucun.
    private IncidentProche selection;
    private Spinner filtreCategorie; // filtre par catégorie (S4.5)
    private String categorieFiltre = null; // nom de la catégorie choisie, null = toutes

    // Demande la permission de localisation puis centre la carte sur le téléphone.
    private final ActivityResultLauncher<String[]> demandePermission = registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(), resultats -> centrerSurMaPosition());

    // Prépare la carte, le filtre, les boutons et la permission de localisation.
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
            // Un toucher sur la carte, hors repère, referme le panneau.
            @Override
            public boolean singleTapConfirmedHelper(GeoPoint point) {
                panneau.setVisibility(View.GONE);
                selection = null;
                return false;
            }

            // Appui long ignoré.
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
        filtreCategorie = findViewById(R.id.filtreCategorie);
        chargerCategories();

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
            // Position obtenue : on centre la carte si le téléphone est dans la commune.
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

            // Position indisponible : on explique pourquoi et on centre la carte sur Nabeul.
            @Override
            public void surErreur(String message) {
                if (isFinishing()) return;
                // On dit pourquoi la carte n'est pas centrée sur le téléphone (permission refusée ou GPS indisponible).
                String cause = Localisation.permissionAccordee(CarteActivity.this) ? "GPS indisponible" : "Permission de localisation refusée";
                Toast.makeText(CarteActivity.this, cause + " : carte centrée sur Nabeul.", Toast.LENGTH_LONG).show();
                charger(OutilsCarte.CENTRE_LAT, OutilsCarte.CENTRE_LNG);
            }
        });
    }

    // ------------------------------------------------------------------ Filtre par catégorie

    // Remplit le filtre ; si le réseau échoue, il ne propose que « Toutes les catégories ».
    private void chargerCategories() {
        final List<Categorie> choix = new ArrayList<>();
        Categorie toutes = new Categorie();
        toutes.nom = "";
        toutes.libelle = "Toutes les catégories";
        choix.add(toutes);
        installerFiltre(choix);
        ApiClient.get(this).categories().enqueue(new Callback<CategoriesResponse>() {
            // Catégories reçues : on les ajoute au filtre.
            @Override
            public void onResponse(Call<CategoriesResponse> appel, Response<CategoriesResponse> reponse) {
                if (isFinishing()) return;
                if (sessionExpiree(reponse)) return;
                if (reponse.isSuccessful() && reponse.body() != null && reponse.body().categories != null) {
                    choix.addAll(reponse.body().categories);
                    installerFiltre(choix);
                }
            }

            // Échec réseau : le filtre reste limité à « Toutes les catégories ».
            @Override
            public void onFailure(Call<CategoriesResponse> appel, Throwable erreur) {
                // Pas de message : la carte reste utilisable sans filtre, et son propre chargement signalera le problème réseau.
            }
        });
    }

    // Branche la liste des catégories sur le Spinner ; un nouveau choix recharge la carte autour de son centre.
    private void installerFiltre(final List<Categorie> choix) {
        filtreCategorie.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, choix));
        filtreCategorie.setSelection(0, false); // sans déclencher l'écouteur ci-dessous
        filtreCategorie.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            // Nouveau choix dans le filtre : recharge les incidents autour du centre de la carte.
            @Override
            public void onItemSelected(AdapterView<?> parent, View vue, int position, long id) {
                String nom = choix.get(position).nom;
                String nouveau = nom == null || nom.isEmpty() ? null : nom;
                if (Objects.equals(nouveau, categorieFiltre)) return;
                categorieFiltre = nouveau;
                IGeoPoint centre = carte.getMapCenter();
                charger(centre.getLatitude(), centre.getLongitude());
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
        });
    }

    // ------------------------------------------------------------------ Incidents

    // Charge les incidents ouverts autour d'un point (F3), filtrés par catégorie si choisie.
    private void charger(double lat, double lng) {
        boutonActualiser.setEnabled(false);
        ApiClient.get(this).incidentsProches(FormatUtil.coordonnee(lat), FormatUtil.coordonnee(lng), RAYON_METRES, categorieFiltre).enqueue(new Callback<IncidentsResponse>() {
            // Réponse de l'API : pose les repères ou affiche l'erreur.
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

            // Réseau indisponible : message clair et bouton réactivé.
            @Override
            public void onFailure(Call<IncidentsResponse> appel, Throwable erreur) {
                if (isFinishing()) return;
                boutonActualiser.setEnabled(true);
                Toast.makeText(CarteActivity.this, ErreurUtil.reseau(erreur), Toast.LENGTH_LONG).show();
            }
        });
    }

    // Remplace les repères de la carte par ceux des incidents reçus, colorés selon le statut.
    private void afficherReperes(List<IncidentProche> incidents) {
        carte.getOverlays().removeAll(reperes);
        reperes.clear();
        panneau.setVisibility(View.GONE);
        selection = null;
        for (final IncidentProche incident : incidents) {
            Marker repere = new Marker(carte);
            repere.setPosition(new GeoPoint(incident.position.lat, incident.position.lng));
            repere.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER);
            repere.setIcon(OutilsCarte.pastille(this, FormatUtil.couleurStatut(incident.statut))); // couleur selon le statut
            repere.setTitle(incident.libelle);
            repere.setOnMarkerClickListener((marqueur, vue) -> {
                afficherPanneau(incident);
                return true;
            });
            carte.getOverlays().add(repere);
            reperes.add(repere);
        }
        carte.invalidate();
        if (incidents.isEmpty()) {
            String message = categorieFiltre == null ? "Aucun incident ouvert dans ce rayon." : "Aucun incident ouvert de cette catégorie dans ce rayon.";
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
        }
    }

    // Affiche le détail de l'incident et règle le bouton « moi aussi » (RG5).
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

    // RG10 : « moi aussi » envoie la position du téléphone ; sans position (GPS coupé, permission refusée), pas de confirmation.
    private void confirmer() {
        if (selection == null) return;
        final IncidentProche incident = selection;
        boutonMoiAussi.setEnabled(false);
        boutonMoiAussi.setText("Recherche de ta position…");
        panneauErreur.setVisibility(View.GONE);
        Localisation.demander(this, new Localisation.Ecouteur() {
            // Position du téléphone obtenue : on envoie la confirmation.
            @Override
            public void surPosition(Location position) {
                if (isFinishing()) return;
                envoyerConfirmation(incident, position.getLatitude(), position.getLongitude());
            }

            // Position introuvable : pas de confirmation, message clair (RG10).
            @Override
            public void surErreur(String message) {
                if (isFinishing()) return;
                afficherErreurPanneau(incident, "Impossible de confirmer sans ta position (permission refusée, GPS désactivé ou signal introuvable). Active la localisation puis réessaie.", true);
            }
        });
    }

    // Envoie la confirmation avec la position du téléphone ; l'API vérifie la distance (RG10) et les autres règles (RG3, RG5).
    private void envoyerConfirmation(final IncidentProche incident, double lat, double lng) {
        Position position = new Position();
        position.lat = lat;
        position.lng = lng;
        ApiClient.get(this).confirmer(incident.id, position).enqueue(new Callback<ConfirmationResponse>() {
            // Réponse de l'API à la confirmation : succès, ou refus (403, 409, 429) avec son message.
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
                    // 403 : trop loin de l'incident (RG10) ; 409 : déjà confirmé, déjà signalé ou clos ; 429 : limite du jour. Le message vient de l'API.
                    int code = reponse.code();
                    afficherErreurPanneau(incident, ErreurUtil.message(reponse), code != 409 && code != 429);
                }
            }

            // Réseau indisponible pendant la confirmation.
            @Override
            public void onFailure(Call<ConfirmationResponse> appel, Throwable erreur) {
                if (isFinishing()) return;
                afficherErreurPanneau(incident, ErreurUtil.reseau(erreur), true);
            }
        });
    }

    // Remet le panneau dans son état normal puis affiche l'erreur ; reessayer = false désactive le bouton (inutile de réessayer).
    private void afficherErreurPanneau(IncidentProche incident, String message, boolean reessayer) {
        if (selection != incident) return; // l'utilisateur a choisi un autre incident entre-temps
        afficherPanneau(incident);
        panneauErreur.setText(message);
        panneauErreur.setVisibility(View.VISIBLE);
        if (!reessayer) boutonMoiAussi.setEnabled(false);
    }

    // Relance l'affichage de la carte au retour sur l'écran.
    @Override
    protected void onResume() {
        super.onResume();
        if (carte != null) carte.onResume();
    }

    // Met la carte en pause quand l'écran passe en arrière-plan.
    @Override
    protected void onPause() {
        super.onPause();
        if (carte != null) carte.onPause();
    }
}
