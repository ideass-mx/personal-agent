plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
}

val sherpaAarFile = file("libs/sherpa-onnx-1.13.4.aar")
val sherpaJniLibsDir = layout.buildDirectory.dir("sherpaJniLibs")

/**
 * Empaqueta de forma explícita las nativas arm64 del AAR de sherpa en
 * jniLibs (además del merge del AAR). Evita depender solo del empaquetado
 * implícito de `implementation(files(...aar))`.
 *
 * No usamos `com.microsoft.onnxruntime:onnxruntime-android`: su
 * `libonnxruntime.so` (1.27.0 Maven) NO es el mismo binario que el del AAR
 * sherpa-onnx 1.13.4 (tamaños/hashes distintos; pickFirst podría sustituir
 * el ORT custom de sherpa y romper el JNI).
 */
val extractSherpaJniLibs by tasks.registering(Copy::class) {
    group = "build"
    description = "Extrae libonnxruntime.so + JNI sherpa (arm64) a jniLibs"
    onlyIf { sherpaAarFile.isFile }
    from(zipTree(sherpaAarFile)) {
        include("jni/arm64-v8a/*.so")
        eachFile {
            // jni/arm64-v8a/foo.so → arm64-v8a/foo.so
            relativePath = RelativePath(true, *relativePath.segments.drop(1).toTypedArray())
        }
        includeEmptyDirs = false
    }
    into(sherpaJniLibsDir)
}

android {
    namespace = "mx.ideass.personal.agent"
    compileSdk = 35

    defaultConfig {
        applicationId = "mx.ideass.personal.agent"
        minSdk = 29
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        // sherpa-onnx: solo arm64-v8a (dispositivo real). Emulador x86 fuera de alcance.
        ndk {
            abiFilters += listOf("arm64-v8a")
        }
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
    }

    sourceSets {
        getByName("main") {
            jniLibs.srcDir(sherpaJniLibsDir)
        }
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
            // bcprov y jspecify ambos aportan este manifiesto OSGi.
            excludes += "META-INF/versions/9/OSGI-INF/MANIFEST.MF"
        }
        jniLibs {
            // Extraer .so al filesystem nativo: resolución de NEEDED (libonnxruntime.so)
            // más fiable en OEMs que mapear desde el APK.
            useLegacyPackaging = true
            // AAR + extractSherpaJniLibs aportan las mismas .so.
            pickFirsts += listOf(
                "**/libonnxruntime.so",
                "**/libsherpa-onnx-jni.so",
                "**/libsherpa-onnx-c-api.so",
                "**/libsherpa-onnx-cxx-api.so",
            )
            // AGP stripDebugDebugSymbols altera libonnxruntime.so del AAR
            // (hash distinto → UnsatisfiedLinkError "couldn't find libonnxruntime.so").
            keepDebugSymbols += listOf(
                "**/libonnxruntime.so",
                "**/libsherpa-onnx-jni.so",
                "**/libsherpa-onnx-c-api.so",
                "**/libsherpa-onnx-cxx-api.so",
            )
        }
    }
}

dependencies {
    // Runtime sherpa-onnx (OfflineTts + JNI). Descargar con android/scripts/fetch-sherpa-cp1.sh
    // Incluye jni/arm64-v8a/libonnxruntime.so + libsherpa-onnx-jni.so (ORT 1.27.0 custom).
    implementation(files(sherpaAarFile))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.bcprov)
    implementation(libs.androidx.security.crypto)
    implementation(libs.commons.compress)
    implementation(libs.hilt.android)
    implementation(libs.hilt.navigation.compose)
    ksp(libs.hilt.compiler)
    debugImplementation(libs.androidx.compose.ui.tooling)
    testImplementation(libs.junit)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.kotlinx.coroutines.test)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.rules)
}

tasks.named("preBuild").configure {
    dependsOn(extractSherpaJniLibs)
}

// Verifica que el APK debug empaqueta onnxruntime + sherpa JNI (arm64) sin strip.
tasks.register<Exec>("verifySherpaNativeLibsInApk") {
    group = "verification"
    description = "Comprueba libonnxruntime.so y libsherpa-onnx-jni.so en el APK debug"
    dependsOn("packageDebug")
    workingDir = rootProject.projectDir
    commandLine(
        "python3",
        "${rootProject.projectDir}/scripts/verify-sherpa-native-libs.py",
        layout.buildDirectory.dir("outputs/apk/debug").get().asFile.absolutePath,
        sherpaAarFile.absolutePath,
    )
}

afterEvaluate {
    tasks.named("assembleDebug").configure {
        finalizedBy("verifySherpaNativeLibsInApk")
    }
}
