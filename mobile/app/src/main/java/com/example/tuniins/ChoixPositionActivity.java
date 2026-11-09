package com.example.tuniins;

import android.content.Intent;
import android.os.Bundle;
import android.widget.Button;
import android.widget.TextView;
import com.example.tuniins.outils.FormatUtil;
import com.example.tuniins.outils.OutilsCarte;
import org.osmdroid.events.MapEventsReceiver;
import org.osmdroid.util.GeoPoint;
import org.osmdroid.views.MapView;
import org.osmdroid.views.overlay.MapEventsOverlay;
import org.osmdroid.views.overlay.Marker;

// Plan B quand le GPS est imprécis ou indisponible (risque du cahier des charges) : le citoyen pose le point à la main.
public class ChoixPositionActivity extends ActiviteProtegee {
    public static final String EXTRA_LAT = "lat";
    public static final String EXTRA_LNG = "lng";

    private MapView carte;
    private Marker repere;
    private TextView texteChoix;
    private Button boutonValider;
    private GeoPoint choix;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (isFinishing()) return;
        OutilsCarte.initialiser(this); // avant setContentView
        setContentView(R.layout.activity_choix_position);
        appliquerInsets(findViewById(R.id.racine));

        carte = findViewById(R.id.carte);
        texteChoix = findViewById(R.id.texteChoix);
        boutonValider = findViewById(R.id.boutonValider);

        // Si une position existe déjà (GPS), la carte s'ouvre dessus ; sinon sur le centre de la commune.
        Intent intent = getIntent();
        boolean positionConnue = intent.hasExtra(EXTRA_LAT) && intent.hasExtra(EXTRA_LNG);
        double lat = positionConnue ? intent.getDoubleExtra(EXTRA_LAT, OutilsCarte.CENTRE_LAT) : OutilsCarte.CENTRE_LAT;
        double lng = positionConnue ? intent.getDoubleExtra(EXTRA_LNG, OutilsCarte.CENTRE_LNG) : OutilsCarte.CENTRE_LNG;
        if (!OutilsCarte.dansLaCommune(lat, lng)) {
            lat = OutilsCarte.CENTRE_LAT;
            lng = OutilsCarte.CENTRE_LNG;
            positionConnue = false;
        }
        OutilsCarte.configurer(carte, lat, lng, positionConnue ? 18.0 : 15.0);

        // Un toucher ou un appui long sur la carte pose le point.
        carte.getOverlays().add(0, new MapEventsOverlay(new MapEventsReceiver() {
            @Override
            public boolean singleTapConfirmedHelper(GeoPoint point) {
                poser(point);
                return true;
            }

            @Override
            public boolean longPressHelper(GeoPoint point) {
                poser(point);
                return true;
            }
        }));
        if (positionConnue) poser(new GeoPoint(lat, lng));

        boutonValider.setOnClickListener(v -> {
            if (choix == null) return;
            Intent resultat = new Intent();
            resultat.putExtra(EXTRA_LAT, choix.getLatitude());
            resultat.putExtra(EXTRA_LNG, choix.getLongitude());
            setResult(RESULT_OK, resultat);
            finish();
        });
    }

    private void poser(GeoPoint point) {
        choix = point;
        if (repere == null) {
            repere = new Marker(carte);
            repere.setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM);
            carte.getOverlays().add(repere);
        }
        repere.setPosition(point);
        carte.invalidate();
        texteChoix.setText("Point choisi : " + FormatUtil.coordonnee(point.getLatitude()) + ", " + FormatUtil.coordonnee(point.getLongitude()));
        boutonValider.setEnabled(true);
    }

    // osmdroid doit suivre le cycle de vie de l'écran (tuiles, capteurs).
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
