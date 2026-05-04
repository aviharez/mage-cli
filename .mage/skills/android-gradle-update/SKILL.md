---
name: android-gradle-update
description: Update Android Gradle Plugin, Kotlin, and library versions step by step — covers version catalog (libs.versions.toml), deprecated API fixes, and namespace migration
---

# Android Gradle Update

Update the Android build toolchain (AGP, Kotlin) and dependencies one step at a time. Always build after each bump to catch breaking changes before stacking more updates.

## CONTRACT

- Do NOT stop between steps.
- Do NOT produce any text response until the final report is written (or a build fails requiring user action).
- Write intermediate findings to `gradle-scratch.md` using tool calls.
- Always use FULL file paths when reading files.
- If a build fails, stop and report the error immediately — do not continue to the next version bump.

---

## Step 0 — Detect OS

```
node -e "console.log(process.platform)"
```

- `win32` → **Windows**: use PowerShell and `.\gradlew` commands below.
- `darwin` / `linux` → **Unix**: use bash and `./gradlew` commands below.

Note: Gradle wrapper commands work on both platforms. On Windows use `.\gradlew`, on Unix use `./gradlew`.

Write `OS=[result]` to `gradle-scratch.md`. Go to Step 1.

---

## Step 1 — Read current versions

**bash:**
```
cat gradle/libs.versions.toml
```
**PowerShell:**
```
Get-Content gradle/libs.versions.toml -ErrorAction SilentlyContinue
```

If the above returns nothing, read the project-level build file:

**bash:**
```
cat build.gradle.kts
```
**PowerShell:**
```
Get-Content build.gradle.kts -ErrorAction SilentlyContinue
```

**bash:**
```
cat app/build.gradle.kts
```
**PowerShell:**
```
Get-Content app/build.gradle.kts -ErrorAction SilentlyContinue
```

Note the current versions of: `agp`, `kotlin`, `compileSdk`, `targetSdk`, `minSdk`, Compose BOM, Hilt, Room, Retrofit, Coroutines. Append to `gradle-scratch.md` under `# CurrentVersions`. Go to Step 2.

---

## Step 2 — Check if version catalog exists

**bash:**
```
find . -name "libs.versions.toml" | head -3
```
**PowerShell:**
```
Get-ChildItem -Recurse -Filter "libs.versions.toml" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 3
```

If no version catalog is found, note in `gradle-scratch.md` that all versions are hardcoded in `build.gradle.kts` files and will need to be edited directly. Go to Step 3.

---

## Step 3 — Update AGP

Edit `gradle/libs.versions.toml` (or `build.gradle.kts`) to bump the `agp` version one minor step at a time (e.g. 8.3 → 8.5 → 8.7 → 8.10). Do not skip more than one minor version at a time.

Then run the build:

**bash:**
```
./gradlew assembleDebug
```
**Windows PowerShell:**
```
.\gradlew assembleDebug
```

If the build **fails**, stop immediately and report the full error output to the user. Do not proceed to Step 4.

If the build **passes**, append `AGP updated OK` to `gradle-scratch.md`. Go to Step 4.

### Common AGP issues to fix before proceeding

**Namespace required (AGP 8.0+):**
```kotlin
// build.gradle.kts
android {
    namespace = "com.example.myapp"  // add this
    compileSdk = 36
}
```

**BuildConfig disabled by default (AGP 8.0+):**
```kotlin
android {
    buildFeatures {
        buildConfig = true
    }
}
```

---

## Step 4 — Update Kotlin

Edit `gradle/libs.versions.toml` to bump the `kotlin` version. Kotlin 2.0+ bundles the Compose compiler — no separate extension version needed.

Then run:

**bash:**
```
./gradlew assembleDebug
```
**Windows PowerShell:**
```
.\gradlew assembleDebug
```

If the build **fails**, stop and report errors. If it **passes**, append `Kotlin updated OK` to `gradle-scratch.md`. Go to Step 5.

---

## Step 5 — Update compileSdk and targetSdk

Edit `app/build.gradle.kts`:
```kotlin
android {
    compileSdk = 36
    defaultConfig {
        targetSdk = 36
        minSdk = 24
    }
}
```

Then run:

**bash:**
```
./gradlew assembleDebug
```
**Windows PowerShell:**
```
.\gradlew assembleDebug
```

### Common SDK bump issues to fix

**targetSdk 35 — Edge-to-Edge enforced:**
```kotlin
// In Activity.onCreate()
enableEdgeToEdge()
ViewCompat.setOnApplyWindowInsetsListener(binding.root) { view, insets ->
    val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
    view.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom)
    insets
}
```

**targetSdk 34 — Foreground service type required:**
```xml
<service android:name=".MyService" android:foregroundServiceType="dataSync" />
```

**targetSdk 33 — Notification permission required:**
```kotlin
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
    requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_CODE)
}
```

If the build passes, append `SDK updated OK` to `gradle-scratch.md`. Go to Step 6.

---

## Step 6 — Update libraries

Update in this order. After each group, run the build before moving to the next.

**1. AndroidX Core / Lifecycle:**
```toml
[versions]
androidx-core-ktx = "1.16.0"
lifecycle = "2.9.0"
```

**bash:** `./gradlew assembleDebug`
**Windows PowerShell:** `.\gradlew assembleDebug`

**2. Compose BOM:**
```toml
compose-bom = "2025.05.00"
```

**bash:** `./gradlew assembleDebug`
**Windows PowerShell:** `.\gradlew assembleDebug`

**3. Hilt (always update runtime + compiler together):**
```toml
hilt = "2.56.1"
```

**bash:** `./gradlew assembleDebug`
**Windows PowerShell:** `.\gradlew assembleDebug`

**4. Room (always update runtime + compiler together):**
```toml
room = "2.7.1"
```

**bash:** `./gradlew assembleDebug`
**Windows PowerShell:** `.\gradlew assembleDebug`

**5. Retrofit / OkHttp:**
```toml
retrofit = "2.11.0"
okhttp = "4.12.0"
```

**bash:** `./gradlew assembleDebug`
**Windows PowerShell:** `.\gradlew assembleDebug`

Stop at any build failure and report the error. If all pass, append `Libraries updated OK` to `gradle-scratch.md`. Go to Step 7.

---

## Step 7 — Check for deprecated API warnings

**bash:**
```
./gradlew assembleDebug 2>&1 | grep -i "deprecat" | sort
```
**Windows PowerShell:**
```
.\gradlew assembleDebug 2>&1 | Select-String -Pattern "deprecat" | Sort-Object | Select-Object -First 30
```

Append any deprecation warnings to `gradle-scratch.md` under `# Deprecations`. Go to Step 8.

---

## Step 8 — Run lint

**bash:**
```
./gradlew lint
```
**Windows PowerShell:**
```
.\gradlew lint
```

Read the lint report:

**bash:**
```
find . -name "lint-results-debug.html" | head -3
```
**Windows PowerShell:**
```
Get-ChildItem -Recurse -Filter "lint-results-debug.xml" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 3
```

Append summary to `gradle-scratch.md` under `# Lint`. Go to Step 9.

---

## Step 9 — Run unit tests

**bash:**
```
./gradlew test
```
**Windows PowerShell:**
```
.\gradlew test
```

If tests fail, stop and report. If they pass, append `Tests passed` to `gradle-scratch.md`. Go to Step 10.

---

## Step 10 — Write the update report

Read `gradle-scratch.md` in full. Write `GRADLE-UPDATE-[YYYY-MM-DD].md` at the project root. Delete `gradle-scratch.md`. This is the only step that produces user-visible output.

```markdown
# Android Gradle Update Report — [Project Name]

**Generated:** [today's date]

## Version Changes

| Component | Before | After | Status |
|-----------|--------|-------|--------|
| AGP | [old] | [new] | ✓ / ✗ |
| Kotlin | [old] | [new] | ✓ / ✗ |
| compileSdk | [old] | [new] | ✓ / ✗ |
| targetSdk | [old] | [new] | ✓ / ✗ |
| Compose BOM | [old] | [new] | ✓ / ✗ |
| Hilt | [old] | [new] | ✓ / ✗ |
| Room | [old] | [new] | ✓ / ✗ |
| Retrofit | [old] | [new] | ✓ / ✗ |

## Issues Found and Fixed

### [Issue title]
**File:** `path/to/file.kts:line`
**Problem:** [what was wrong]
**Fix applied:**
```kotlin
// before / after
```

## Deprecation Warnings (require manual attention)

| Warning | File | Recommended fix |
|---------|------|-----------------|

## Lint Issues

| Severity | Issue | File |
|----------|-------|------|

## Build Results

- Debug build: ✓ / ✗
- Unit tests: ✓ / ✗
- Lint: ✓ warnings / ✗ errors
```

---

## Common issues reference

| Error | Fix |
|-------|-----|
| `Namespace not specified` | Add `namespace = "com.example.app"` to `android {}` block |
| `BuildConfig cannot be resolved` | Add `buildFeatures { buildConfig = true }` |
| Compose compiler version mismatch | Use Kotlin 2.0+ (compiler bundled) or match extension to Kotlin version |
| `kapt` failing after Room update | Migrate to `ksp`: replace `kapt(libs.room.compiler)` with `ksp(libs.room.compiler)` |
| `Cannot access class 'X'` after R class change | Qualify R references with the correct module package |
| `foregroundServiceType` missing | Declare service type in manifest for targetSdk 34+ |

## Guidelines

- Bump AGP and Kotlin separately — easier to bisect failures
- Always update `*-compiler` (KSP/KAPT) to the same version as their runtime (Room, Hilt)
- Commit after each successful step
- The Compose BOM version controls all Compose artifact versions — update BOM, not individual artifacts
