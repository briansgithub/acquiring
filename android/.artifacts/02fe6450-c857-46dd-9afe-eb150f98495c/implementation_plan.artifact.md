# Implementation Plan - Fix Room Coroutines Support

## Problem
Room's annotation processor (`kapt`) is failing to recognize `suspend` functions in `SongDao`. This causes it to treat the `Continuation` parameter as a database column and the `Object` return type as the literal return type, leading to build errors.

## Proposed Changes

### Build Configuration

#### [MODIFY] [app/build.gradle](file:///H:/Desktop/3_sacred_ring/android/app/build.gradle)
- Update Room version from `2.5.2` to `2.6.1`.
- Add explicit dependencies for `kotlinx-coroutines-core` and `kotlinx-coroutines-android` (version `1.7.1`). Even though they might be transitively included, explicit inclusion often helps `kapt` resolve types correctly during annotation processing.

## Verification Plan

### Automated Tests
- Run `./gradlew :app:kaptDebugKotlin` to verify that the DAO stubs are generated correctly.
- Run a full build: `./gradlew assembleDebug`.

### Manual Verification
- Confirm the project compiles and the Room database functions as expected.
