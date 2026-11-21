package com.example.tuniins.outils;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;

// Prépare la photo avant l'envoi : redimensionnée (1600 pixels maximum), remise à l'endroit, compressée en JPEG.
// L'API refuse les fichiers de plus de 5 Mo et une photo d'appareil moderne en pèse facilement 5 à 10.
public final class PhotoUtil {
    private static final int COTE_MAX = 1600;
    private static final int TAILLE_MAX_OCTETS = 4 * 1024 * 1024; // marge sous la limite de 5 Mo de l'API

    private PhotoUtil() {}

    // Dossier cache/photos de l'application, créé au besoin.
    public static File dossier(Context contexte) {
        File dossier = new File(contexte.getCacheDir(), "photos");
        //noinspection ResultOfMethodCallIgnored
        dossier.mkdirs();
        return dossier;
    }

    // À appeler hors du thread principal (décodage et compression d'une image).
    public static File reduire(Context contexte, Uri source) throws IOException {
        BitmapFactory.Options mesure = new BitmapFactory.Options();
        mesure.inJustDecodeBounds = true;
        try (InputStream in = contexte.getContentResolver().openInputStream(source)) {
            if (in == null) throw new IOException("Photo illisible.");
            BitmapFactory.decodeStream(in, null, mesure);
        }
        if (mesure.outWidth <= 0 || mesure.outHeight <= 0) throw new IOException("Format d'image non pris en charge. Choisis une photo JPEG ou PNG.");

        // Décodage à taille réduite (puissance de 2) pour ne pas charger 12 millions de pixels en mémoire.
        int echantillon = 1;
        while (Math.max(mesure.outWidth, mesure.outHeight) / (echantillon * 2) >= COTE_MAX) echantillon *= 2;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = echantillon;
        Bitmap image;
        try (InputStream in = contexte.getContentResolver().openInputStream(source)) {
            if (in == null) throw new IOException("Photo illisible.");
            image = BitmapFactory.decodeStream(in, null, options);
        }
        if (image == null) throw new IOException("Format d'image non pris en charge. Choisis une photo JPEG ou PNG.");

        // Taille finale et rotation (les appareils photo enregistrent souvent l'image couchée avec une indication d'orientation).
        float echelle = Math.min(1f, (float) COTE_MAX / Math.max(image.getWidth(), image.getHeight()));
        Matrix matrice = new Matrix();
        matrice.postScale(echelle, echelle);
        matrice.postRotate(rotation(contexte, source));
        Bitmap finale = Bitmap.createBitmap(image, 0, 0, image.getWidth(), image.getHeight(), matrice, true);
        if (finale != image) image.recycle();

        File sortie = new File(dossier(contexte), "signalement.jpg");
        byte[] octets = null;
        for (int qualite = 85; qualite >= 45; qualite -= 20) {
            ByteArrayOutputStream tampon = new ByteArrayOutputStream();
            finale.compress(Bitmap.CompressFormat.JPEG, qualite, tampon);
            octets = tampon.toByteArray();
            if (octets.length <= TAILLE_MAX_OCTETS) break;
        }
        finale.recycle();
        if (octets == null || octets.length > TAILLE_MAX_OCTETS) throw new IOException("La photo est trop lourde.");
        try (FileOutputStream fichier = new FileOutputStream(sortie)) {
            fichier.write(octets);
        }
        return sortie;
    }

    // Lit l'orientation EXIF de la photo pour la redresser.
    private static int rotation(Context contexte, Uri source) {
        try (InputStream in = contexte.getContentResolver().openInputStream(source)) {
            if (in == null) return 0;
            int orientation = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            if (orientation == ExifInterface.ORIENTATION_ROTATE_90) return 90;
            if (orientation == ExifInterface.ORIENTATION_ROTATE_180) return 180;
            if (orientation == ExifInterface.ORIENTATION_ROTATE_270) return 270;
        } catch (IOException ignore) {
            // pas d'information d'orientation : on garde l'image telle quelle
        }
        return 0;
    }
}
