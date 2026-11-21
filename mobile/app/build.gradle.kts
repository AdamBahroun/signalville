plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.example.tuniins"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "com.example.tuniins"
        minSdk = 24
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            optimization {
                enable = true
                packageScope = setOf("androidx.**", "kotlin.**", "kotlinx.**")
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

dependencies {
    implementation(libs.appcompat)
    implementation(libs.material)
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("org.osmdroid:osmdroid-android:6.1.20") // carte OpenStreetMap
    implementation("androidx.recyclerview:recyclerview:1.4.0") // liste « Mes signalements »
    // Notifications Firebase (S4.1) : la bibliothèque est toujours compilée, mais ne s'active que si google-services.json existe
    implementation(platform("com.google.firebase:firebase-bom:35.1.0"))
    implementation("com.google.firebase:firebase-messaging")
}

// S4.1 : le plugin Firebase n'est appliqué que si app/google-services.json est présent, sinon le build fonctionne sans notifications.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

tasks.register<Exec>("adbReverse") {
    val androidHome = System.getenv("ANDROID_HOME") ?: System.getenv("ANDROID_SDK_ROOT") ?: "${System.getProperty("user.home")}/AppData/Local/Android/Sdk"
    val adbExecutable = File(androidHome, "platform-tools/adb").absolutePath
    commandLine(adbExecutable, "reverse", "tcp:3000", "tcp:3000")
    isIgnoreExitValue = true
}

tasks.named("preBuild") {
    dependsOn("adbReverse")
}