# SlapLab Quest 3 — Unity Build Automation package

This package is prepared for **Unity 6 / 6000.0.66f2** and **Unity Build Automation**.

## Build target
- Platform: Android
- Architecture: ARM64
- Minimum Android API: 29
- Output: APK
- Scene: `Assets/Scenes/Main.unity`
- Bundle ID: set this in Unity Build Automation (recommended: `com.slaplab.quest3`)

## Unity Build Automation
1. Push/upload this project to the GitHub repository connected to Unity Build Automation.
2. In Unity Dashboard → DevOps → Build Automation → Configurations, use the `main` branch.
3. Select Android as the target platform.
4. Use Unity `6000.0.66f2` (or the closest compatible Unity 6 version if that exact editor is unavailable).
5. For a test APK, use the auto-generated debug Android keystore.
6. Build the configuration.
7. Download the APK from the successful build artifact.

No Codemagic workflow or GitHub Actions workflow is included in this package.
