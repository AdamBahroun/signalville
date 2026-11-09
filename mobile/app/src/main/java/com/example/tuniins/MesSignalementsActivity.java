package com.example.tuniins;

import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import com.example.tuniins.api.ApiClient;
import com.example.tuniins.api.ErreurUtil;
import com.example.tuniins.api.MesSignalementsResponse;
import com.example.tuniins.api.MonSignalement;
import com.example.tuniins.outils.FormatUtil;
import com.google.gson.Gson;
import java.util.ArrayList;
import java.util.List;
import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

// S3.6 : mes signalements et l'état de leur incident (le citoyen voit le statut changer).
public class MesSignalementsActivity extends ActiviteProtegee {
    private ProgressBar progression;
    private TextView texteVide, texteErreur;
    private RecyclerView liste;
    private final List<MonSignalement> signalements = new ArrayList<>();
    private Adaptateur adaptateur;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (isFinishing()) return;
        setContentView(R.layout.activity_mes_signalements);
        appliquerInsets(findViewById(R.id.racine));

        progression = findViewById(R.id.progression);
        texteVide = findViewById(R.id.texteVide);
        texteErreur = findViewById(R.id.texteErreur);
        liste = findViewById(R.id.liste);

        adaptateur = new Adaptateur(signalements, signalement -> {
            Intent intent = new Intent(this, SuiviActivity.class);
            intent.putExtra(SuiviActivity.EXTRA_SIGNALEMENT, new Gson().toJson(signalement));
            startActivity(intent);
        });
        liste.setLayoutManager(new LinearLayoutManager(this));
        liste.setAdapter(adaptateur);
        findViewById(R.id.boutonActualiser).setOnClickListener(v -> charger());
    }

    // On recharge à chaque retour sur l'écran : le statut a pu changer pendant ce temps.
    @Override
    protected void onResume() {
        super.onResume();
        if (!isFinishing()) charger();
    }

    private void charger() {
        progression.setVisibility(View.VISIBLE);
        texteErreur.setVisibility(View.GONE);
        ApiClient.get(this).mesSignalements().enqueue(new Callback<MesSignalementsResponse>() {
            @Override
            public void onResponse(Call<MesSignalementsResponse> appel, Response<MesSignalementsResponse> reponse) {
                if (isFinishing()) return;
                if (sessionExpiree(reponse)) return;
                progression.setVisibility(View.GONE);
                if (reponse.isSuccessful() && reponse.body() != null && reponse.body().signalements != null) {
                    signalements.clear();
                    signalements.addAll(reponse.body().signalements);
                    adaptateur.notifyDataSetChanged();
                    texteVide.setVisibility(signalements.isEmpty() ? View.VISIBLE : View.GONE);
                } else {
                    afficherErreur(ErreurUtil.message(reponse));
                }
            }

            @Override
            public void onFailure(Call<MesSignalementsResponse> appel, Throwable erreur) {
                if (isFinishing()) return;
                progression.setVisibility(View.GONE);
                afficherErreur("Impossible de joindre le serveur. Vérifie la connexion.");
            }
        });
    }

    private void afficherErreur(String message) {
        texteErreur.setText(message);
        texteErreur.setVisibility(View.VISIBLE);
    }

    // ------------------------------------------------------------------ Liste

    interface SurClic {
        void ouvrir(MonSignalement signalement);
    }

    static class Adaptateur extends RecyclerView.Adapter<Adaptateur.Ligne> {
        private final List<MonSignalement> donnees;
        private final SurClic surClic;

        Adaptateur(List<MonSignalement> donnees, SurClic surClic) {
            this.donnees = donnees;
            this.surClic = surClic;
        }

        @NonNull
        @Override
        public Ligne onCreateViewHolder(@NonNull ViewGroup parent, int type) {
            return new Ligne(LayoutInflater.from(parent.getContext()).inflate(R.layout.item_signalement, parent, false));
        }

        @Override
        public void onBindViewHolder(@NonNull Ligne ligne, int position) {
            final MonSignalement s = donnees.get(position);
            ligne.titre.setText(s.libelle);
            ligne.date.setText(FormatUtil.date(s.date));
            ligne.description.setText(s.description);

            // Un signalement rejeté par la modération n'a plus d'incident vivant : on l'indique clairement.
            String libelleStatut = s.rejete ? "Signalement rejeté" : s.incident != null ? s.incident.libelleStatut : "";
            String statut = s.rejete ? "rejete" : s.incident != null ? s.incident.statut : "nouveau";
            ligne.statut.setText(libelleStatut);
            ligne.statut.setTextColor(FormatUtil.couleurStatut(statut));
            ligne.itemView.setOnClickListener(v -> surClic.ouvrir(s));
        }

        @Override
        public int getItemCount() {
            return donnees.size();
        }

        static class Ligne extends RecyclerView.ViewHolder {
            final TextView titre, date, description, statut;

            Ligne(@NonNull View vue) {
                super(vue);
                titre = vue.findViewById(R.id.itemTitre);
                date = vue.findViewById(R.id.itemDate);
                description = vue.findViewById(R.id.itemDescription);
                statut = vue.findViewById(R.id.itemStatut);
            }
        }
    }
}
