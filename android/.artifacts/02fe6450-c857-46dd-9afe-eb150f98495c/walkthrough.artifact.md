# Walkthrough - Fix Room Coroutines Support

I have fixed the issue where the Room annotation processor was unable to correctly handle `suspend` functions in the `SongDao` when using Kotlin 2.2.10 and AGP 9.3.1.

## Changes

### Build Configuration

#### [app/build.gradle](file:///H:/Desktop/3_sacred_ring/android/app/build.gradle)
- Updated **Room** from `2.5.2` to `2.8.4`. This version is required for full compatibility with the K2 compiler features in Kotlin 2.x.
- Added explicit **Coroutines** dependencies (`1.11.0`) to ensure the Room compiler can correctly resolve `suspend` function types.
- Configured `kapt { correctErrorTypes = true }` to allow the compiler to better handle intermediate stub generation issues.
- Fixed the **Serialization** plugin application by removing the hardcoded version (which is now managed by the project's classpath).

#### [build.gradle](file:///H:/Desktop/3_sacred_ring/android/build.gradle)
- Added `org.jetbrains.kotlin:kotlin-serialization:2.2.10` to the buildscript classpath to support the version-less plugin application in the app module.

## Verification Results

### Automated Tests
- Successfully ran `:app:kaptDebugKotlin`.
- Successfully ran `assembleDebug`.

> [!TIP]
> While `kapt` is now working, keep an eye on build performance. With Kotlin 2.x, migrating to **KSP** is recommended once stable versions for your specific toolchain are available. I attempted KSP migration, but encountered an "unexpected jvm signature" error, suggesting it may still be in early development for Kotlin 2.2.10.
