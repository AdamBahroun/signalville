// Top-level build file where you can add configuration options common to all sub-projects/modules.
plugins {
    alias(libs.plugins.android.application) apply false
    // Plugin Firebase : déclaré ici, appliqué dans app/build.gradle.kts seulement si google-services.json existe
    alias(libs.plugins.google.services) apply false
}