plugins { id("com.android.library"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "com.local.notesmedia"
    compileSdk = 36
    defaultConfig { minSdk = 26 }
    compileOptions { sourceCompatibility=JavaVersion.VERSION_1_8; targetCompatibility=JavaVersion.VERSION_1_8 }
}
kotlin { compilerOptions { jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_1_8 } }
dependencies { implementation(project(":tauri-android")) }
