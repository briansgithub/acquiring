# Onboarding / one-shot introduction

2026-11-07T13:40Z Frozen 801cf798 IntroductionPrefs + IntroductionView one-shot gate. localStorage `acquiring-onboarding`/`hasCompletedIntroduction` matches SharedPreferences, not T06 user records and not diagnostics reset. Continue writes the flag; tests that need Library use a disposable Playwright storageState fixture instead of deleting app data. Example cards still deferred. Diagnostics/reset remain separately scoped.
