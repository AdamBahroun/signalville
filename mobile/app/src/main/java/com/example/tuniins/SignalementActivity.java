package com.example.tuniins;

import android.Manifest;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.Spinner;
import android.widget.TextView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AlertDialog;
import androidx.core.content.FileProvider;
import com.example.tuniins.api.ApiClient;
import com.example.tuniins.api.Categorie;
import com.example.tuniins.api.CategoriesResponse;
import com.example.tuniins.api.ErreurUtil;
import com.example.tuniins.api.SignalementResponse;
import com.example.tuniins.outils.FormatUtil;
import com.example.tuniins.outils.Localisation;
import com.example.tuniins.outils.PhotoUtil;
import java.io.File;
import java.io.IOException;
import okhttp3.MediaType;
import okhttp3.MultipartBody;
import okhttp3.RequestBody;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

// S3.3 : créer un signalement (catégorie, description, position GPS ou posée sur la carte, photo facultative).
public class SignalementActivity extends ActiviteProtegee {
    private Spinner spinnerCategorie;
    private EditText champDescription;
    private TextView textePosition, texteErreur;
    private ImageView apercu;
    private Button boutonRetirerPhoto, boutonEnvoyer;
    private ProgressBar progression;

    private Double lat, lng;
    private File photo; // photo réduite, prête à l'envoi ; null s'il n'y en a pas
    private Uri uriCamera; // où l'appareil photo écrit la photo
    private boolean categoriesChargees = false;

    private final ActivityResultLauncher<String[]> demandePermission = registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(), resultats -> {
                if (Localisation.permissionAccordee(this)) trouverPosition();
                else afficherErreur("Permission de localisation refusée. Tu peux choisir la position sur la carte.");
            });

    private final ActivityResultLauncher<Uri> prisePhoto = registerForActivityResult(new ActivityResultContracts.TakePicture(), succes -> {
        if (Boolean.TRUE.equals(succes) && uriCamera != null) preparerPhoto(uriCamera);
    });

    private final ActivityResultLauncher<String> choixGalerie = registerForActivityResult(new ActivityResultContracts.GetContent(), uri -> {
        if (uri != null) preparerPhoto(uri);
    });

    private final ActivityResultLauncher<Intent> choixCarte = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), resultat -> {
        Intent donnees = resultat.getData();
        if (resultat.getResultCode() == RESULT_OK && donnees != null && donnees.hasExtra(ChoixPositionActivity.EXTRA_LAT)) {
            definirPosition(donnees.getDoubleExtra(ChoixPositionActivity.EXTRA_LAT, 0), donnees.getDoubleExtra(ChoixPositionActivity.EXTRA_LNG, 0), "posée sur la carte");
        }
    });

    // Prépare le formulaire de signalement : catégorie, description, position et photo.
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (isFinishing()) return;
        setContentView(R.layout.activity_signalement);
        appliquerInsets(findViewById(R.id.racine));

        spinnerCategorie = findViewById(R.id.spinnerCategorie);
        champDescription = findViewById(R.id.champDescription);
        textePosition = findViewById(R.id.textePosition);
        texteErreur = findViewById(R.id.texteErreur);
        apercu = findViewById(R.id.apercu);
        boutonRetirerPhoto = findViewById(R.id.boutonRetirerPhoto);
        boutonEnvoyer = findViewById(R.id.boutonEnvoyer);
        progression = findViewById(R.id.progression);

        if (savedInstanceState != null) {
            if (savedInstanceState.containsKey("lat")) {
                lat = savedInstanceState.getDouble("lat");
                lng = savedInstanceState.getDouble("lng");
            }
            String chemin = savedInstanceState.getString("photo");
            if (chemin != null && new File(chemin).exists()) {
                photo = new File(chemin);
                afficherApercu();
            }
            String uri = savedInstanceState.getString("uriCamera");
            if (uri != null) uriCamera = Uri.parse(uri);
        }
        majTextePosition();

        findViewById(R.id.boutonMaPosition).setOnClickListener(v -> {
            texteErreur.setVisibility(View.GONE);
            if (Localisation.permissionAccordee(this)) trouverPosition();
            else demandePermission.launch(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION});
        });
        findViewById(R.id.boutonChoisirCarte).setOnClickListener(v -> {
            Intent intent = new Intent(this, ChoixPositionActivity.class);
            if (lat != null && lng != null) {
                intent.putExtra(ChoixPositionActivity.EXTRA_LAT, lat.doubleValue());
                intent.putExtra(ChoixPositionActivity.EXTRA_LNG, lng.doubleValue());
            }
            choixCarte.launch(intent);
        });
        findViewById(R.id.boutonPhoto).setOnClickListener(v -> ouvrirAppareilPhoto());
        findViewById(R.id.boutonGalerie).setOnClickListener(v -> choixGalerie.launch("image/*"));
        boutonRetirerPhoto.setOnClickListener(v -> retirerPhoto());
        boutonEnvoyer.setOnClickListener(v -> verifierPuisEnvoyer());

        chargerCategories();
    }

    // Conserve la position et la photo si l'écran est recréé (rotation, appareil photo).
    @Override
    protected void onSaveInstanceState(Bundle etat) {
        super.onSaveInstanceState(etat);
        if (lat != null && lng != null) {
            etat.putDouble("lat", lat);
            etat.putDouble("lng", lng);
        }
        if (photo != null) etat.putString("photo", photo.getAbsolutePath());
        if (uriCamera != null) etat.putString("uriCamera", uriCamera.toString());
    }

    // ------------------------------------------------------------------ Catégories

    // Charge les catégories depuis l'API pour la liste déroulante.
    private void chargerCategories() {
        ApiClient.get(this).categories().enqueue(new Callback<CategoriesResponse>() {
            // Catégories reçues : on remplit la liste déroulante.
            @Override
            public void onResponse(Call<CategoriesResponse> appel, Response<CategoriesResponse> reponse) {
                if (isFinishing()) return;
                if (sessionExpiree(reponse)) return;
                if (reponse.isSuccessful() && reponse.body() != null && reponse.body().categories != null) {
                    spinnerCategorie.setAdapter(new ArrayAdapter<>(SignalementActivity.this, android.R.layout.simple_spinner_dropdown_item, reponse.body().categories));
                    categoriesChargees = true;
                } else {
                    afficherErreur(ErreurUtil.message(reponse));
                }
            }

            // Réseau indisponible : l'envoi reste impossible tant que les catégories manquent.
            @Override
            public void onFailure(Call<CategoriesResponse> appel, Throwable erreur) {
                if (isFinishing()) return;
                afficherErreur("Impossible de charger les catégories. Vérifie la connexion puis rouvre cet écran.");
            }
        });
    }

    // ------------------------------------------------------------------ Position

    // Cherche la position du téléphone pour le signalement.
    private void trouverPosition() {
        textePosition.setText("Position : recherche en cours…");
        Localisation.demander(this, new Localisation.Ecouteur() {
            // Position du téléphone trouvée : on la retient comme position du signalement.
            @Override
            public void surPosition(android.location.Location position) {
                if (isFinishing()) return;
                definirPosition(position.getLatitude(), position.getLongitude(), "GPS");
            }

            // Position introuvable : message clair, le citoyen peut choisir le point sur la carte.
            @Override
            public void surErreur(String message) {
                if (isFinishing()) return;
                majTextePosition();
                afficherErreur(message);
            }
        });
    }

    // Mémorise la position choisie et son origine (téléphone ou carte).
    private void definirPosition(double latitude, double longitude, String origine) {
        lat = latitude;
        lng = longitude;
        texteErreur.setVisibility(View.GONE);
        textePosition.setText("Position : " + FormatUtil.coordonnee(latitude) + ", " + FormatUtil.coordonnee(longitude) + " (" + origine + ")");
    }

    // Met à jour le texte qui affiche la position choisie.
    private void majTextePosition() {
        if (lat == null || lng == null) textePosition.setText("Position : non définie");
        else textePosition.setText("Position : " + FormatUtil.coordonnee(lat) + ", " + FormatUtil.coordonnee(lng));
    }

    // ------------------------------------------------------------------ Photo

    // Lance l'appareil photo avec un fichier temporaire dans le cache.
    private void ouvrirAppareilPhoto() {
        try {
            File fichier = new File(PhotoUtil.dossier(this), "camera.jpg");
            uriCamera = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", fichier);
            prisePhoto.launch(uriCamera);
        } catch (RuntimeException e) { // ActivityNotFoundException : aucun appareil photo (émulateur sans caméra, par exemple)
            afficherErreur("Impossible d'ouvrir l'appareil photo. Utilise la galerie.");
        }
    }

    // Réduit et corrige l'orientation de la photo en arrière-plan avant l'envoi.
    private void preparerPhoto(final Uri source) {
        texteErreur.setVisibility(View.GONE);
        boutonEnvoyer.setEnabled(false);
        // Décodage et compression d'une image : hors du thread principal.
        new Thread(() -> {
            try {
                final File reduite = PhotoUtil.reduire(getApplicationContext(), source);
                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed()) return;
                    photo = reduite;
                    afficherApercu();
                    boutonEnvoyer.setEnabled(true);
                });
            } catch (IOException | RuntimeException e) {
                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed()) return;
                    boutonEnvoyer.setEnabled(true);
                    afficherErreur(e instanceof IOException && e.getMessage() != null ? e.getMessage() : "Impossible de lire cette photo.");
                });
            }
        }).start();
    }

    // Affiche l'aperçu de la photo préparée.
    private void afficherApercu() {
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = 4; // l'aperçu n'a pas besoin de 1600 pixels
        Bitmap miniature = BitmapFactory.decodeFile(photo.getAbsolutePath(), options);
        apercu.setImageBitmap(miniature);
        apercu.setVisibility(View.VISIBLE);
        boutonRetirerPhoto.setVisibility(View.VISIBLE);
    }

    // Retire la photo choisie et son aperçu.
    private void retirerPhoto() {
        photo = null;
        apercu.setImageDrawable(null);
        apercu.setVisibility(View.GONE);
        boutonRetirerPhoto.setVisibility(View.GONE);
    }

    // ------------------------------------------------------------------ Envoi

    // Contrôle les champs, avertit sur la vie privée si une photo est jointe, puis envoie.
    private void verifierPuisEnvoyer() {
        texteErreur.setVisibility(View.GONE);
        if (!categoriesChargees || !(spinnerCategorie.getSelectedItem() instanceof Categorie)) {
            afficherErreur("Les catégories ne sont pas chargées. Vérifie la connexion puis rouvre cet écran.");
            return;
        }
        final Categorie categorie = (Categorie) spinnerCategorie.getSelectedItem();
        final String description = champDescription.getText().toString().trim();
        if (description.length() < 3) {
            afficherErreur("La description doit contenir au moins 3 caractères.");
            return;
        }
        if (lat == null || lng == null) {
            afficherErreur("Définis d'abord la position de l'incident (ma position, ou point sur la carte).");
            return;
        }
        if (photo == null) {
            envoyer(categorie, description);
            return;
        }
        // Vie privée (section 8 du cahier des charges) : avertissement avant l'envoi d'une photo.
        new AlertDialog.Builder(this)
                .setTitle("Avant d'envoyer la photo")
                .setMessage("Ta photo sera visible par la municipalité. Vérifie qu'elle ne montre ni visage ni plaque d'immatriculation lisible.")
                .setPositiveButton("Envoyer", (dialogue, bouton) -> envoyer(categorie, description))
                .setNegativeButton("Annuler", null)
                .show();
    }

    // Envoie le signalement à l'API en multipart (la photo est facultative).
    private void envoyer(Categorie categorie, String description) {
        enCours(true);
        MediaType texte = MediaType.parse("text/plain; charset=utf-8");
        MultipartBody.Part partPhoto = null;
        if (photo != null) {
            partPhoto = MultipartBody.Part.createFormData("photo", "photo.jpg", RequestBody.create(photo, MediaType.parse("image/jpeg")));
        }
        ApiClient.get(this)
                .creerSignalement(
                        RequestBody.create(categorie.nom, texte),
                        RequestBody.create(description, texte),
                        RequestBody.create(FormatUtil.coordonnee(lat), texte),
                        RequestBody.create(FormatUtil.coordonnee(lng), texte),
                        partPhoto)
                .enqueue(new Callback<SignalementResponse>() {
                    // Signalement créé : confirmation ; sinon message de l'API (RG6, RG9).
                    @Override
                    public void onResponse(Call<SignalementResponse> appel, Response<SignalementResponse> reponse) {
                        if (isFinishing()) return;
                        if (sessionExpiree(reponse)) return;
                        enCours(false);
                        if (reponse.isSuccessful() && reponse.body() != null) {
                            supprimerPhotosTemporaires();
                            confirmerEnvoi(reponse.body().nouvelIncident);
                        } else {
                            afficherErreur(ErreurUtil.message(reponse));
                        }
                    }

                    // Réseau indisponible pendant l'envoi.
                    @Override
                    public void onFailure(Call<SignalementResponse> appel, Throwable erreur) {
                        if (isFinishing()) return;
                        enCours(false);
                        afficherErreur(ErreurUtil.reseau(erreur));
                    }
                });
    }

    // Indique si le signalement a créé un nouvel incident ou a rejoint un incident existant (RG2).
    private void confirmerEnvoi(boolean nouvelIncident) {
        String message = nouvelIncident
                ? "Ton signalement a créé un nouvel incident. Tu peux suivre son état dans « Mes signalements »."
                : "Ce problème avait déjà été signalé tout près : ton signalement a été rattaché au même incident, ce qui augmente sa priorité.";
        new AlertDialog.Builder(this)
                .setTitle("Signalement envoyé")
                .setMessage(message)
                .setCancelable(false)
                .setPositiveButton("OK", (dialogue, bouton) -> finish())
                .show();
    }

    // Supprime les photos temporaires du cache.
    private void supprimerPhotosTemporaires() {
        File[] fichiers = PhotoUtil.dossier(this).listFiles();
        if (fichiers == null) return;
        for (File f : fichiers) //noinspection ResultOfMethodCallIgnored
            f.delete();
    }

    // Affiche ou masque la progression et verrouille le bouton.
    private void enCours(boolean actif) {
        progression.setVisibility(actif ? View.VISIBLE : View.GONE);
        boutonEnvoyer.setEnabled(!actif);
        if (actif) texteErreur.setVisibility(View.GONE);
    }

    // Affiche un message d'erreur sous le formulaire.
    private void afficherErreur(String message) {
        texteErreur.setText(message);
        texteErreur.setVisibility(View.VISIBLE);
    }
}
