import org.jetbrains.kotlin.gradle.dsl.JvmTarget
plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace="com.local.notesscan.harness"
    compileSdk=36
    defaultConfig {
        applicationId="com.local.notesscan.harness"
        minSdk=26
        targetSdk=36
        versionCode=1
        versionName="0.1.0"
    }
    compileOptions { sourceCompatibility=JavaVersion.VERSION_1_8; targetCompatibility=JavaVersion.VERSION_1_8 }
}
kotlin { compilerOptions { jvmTarget=JvmTarget.JVM_1_8 } }
dependencies { implementation(project(":")) }
