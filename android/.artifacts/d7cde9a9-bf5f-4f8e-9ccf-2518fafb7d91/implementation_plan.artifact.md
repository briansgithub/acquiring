# Implementation Plan - Dark Mode Theme

Force the app to use a dark theme by default using Material 3 `darkColorScheme`.

## User Review Required

> [!NOTE]
> I will force dark mode as the default appearance for the app. This will affect all screens, including the search, library, and chord display.

## Proposed Changes

### UI & Theming
- [MODIFY] [MainActivity.kt](file:///H:/Desktop/3_sacred_ring/android/app/src/main/java/com/sacredring/android/MainActivity.kt)
    - Define a `DarkColorScheme` using `darkColorScheme()`.
    - Update `MainActivity`'s `setContent` to use `DarkColorScheme` inside `MaterialTheme`.
- [MODIFY] [themes.xml](file:///H:/Desktop/3_sacred_ring/android/app/src/main/res/values/themes.xml)
    - Update the base theme to parent from a dark theme to ensure system components and splash screen align with the dark aesthetic.

## Verification Plan

### Manual Verification
1. **App Launch**: Verify the background is dark and text is light upon launch.
2. **Search View**: Verify search bar and suggestions have appropriate dark contrast.
3. **Chord Detail**: Verify the chord grid and info tab are correctly styled in dark mode.
4. **System Bars**: Verify the status bar and navigation bar are legible.
