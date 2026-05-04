---
name: feature-flag-cleanup
description: Find and remove stale feature flags across Angular, Kotlin Android, and SwiftUI codebases — identify permanently-on or permanently-off flags and safely delete the dead code branches
---

# Feature Flag Cleanup

Locate stale feature flags that are permanently enabled or disabled and remove the dead code paths they guard. Always verify flag status with the team before deleting anything.

## CONTRACT

- Do NOT stop between steps.
- Do NOT produce any text response until the final inventory report is written.
- Write intermediate findings to `flag-scratch.md` using tool calls.
- Always use FULL file paths when reading files.
- Do NOT delete or modify any code — this skill only audits and reports. The developer applies fixes manually.
- The task is complete only when `FLAG-INVENTORY-[YYYY-MM-DD].md` exists on disk.

---

## Step 0 — Detect OS

```
node -e "console.log(process.platform)"
```

- `win32` → **Windows**: use PowerShell commands in every step below.
- `darwin` / `linux` → **Unix**: use bash commands in every step below.

Write `OS=[result]` to `flag-scratch.md`. Go to Step 1.

---

## Step 1 — Find Angular / TypeScript feature flags

**bash:**
```
grep -rn "featureFlag\|feature_flag\|isEnabled\|FF_\|FLAG_" src --include="*.ts" | grep -v "//.*\|spec\|test\|mock" | head -40
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "featureFlag|feature_flag|isEnabled|FF_|FLAG_" | Where-Object { $_.Line -notmatch "//|spec|test|mock" } | Select-Object Path, LineNumber, Line | Select-Object -First 40
```

**bash:**
```
find src -name "feature*.ts" -o -name "flags*.ts" -o -name "*feature-flag*.ts" | head -10
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "feature*.ts","flags*.ts","*feature-flag*.ts" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 10
```

Read each flag definition file found. Append results to `flag-scratch.md` under `# Angular`. Go to Step 2.

---

## Step 2 — Find Android / Kotlin feature flags

**bash:**
```
grep -rn "FeatureFlag\|featureFlag\|isEnabled\|FEATURE_\|FF_" app/src --include="*.kt" | grep -v "//.*\|spec\|test\|mock" | head -40
```
**PowerShell:**
```
Get-ChildItem -Path app/src -Recurse -Include "*.kt" -ErrorAction SilentlyContinue | Select-String -Pattern "FeatureFlag|featureFlag|isEnabled|FEATURE_|FF_" | Where-Object { $_.Line -notmatch "//|spec|test|mock" } | Select-Object Path, LineNumber, Line | Select-Object -First 40
```

**bash:**
```
grep -rn "BuildConfig\." app/src --include="*.kt" | grep -v "//.*\|spec\|test\|BuildConfig\.DEBUG\|BuildConfig\.VERSION" | head -20
```
**PowerShell:**
```
Get-ChildItem -Path app/src -Recurse -Include "*.kt" -ErrorAction SilentlyContinue | Select-String -Pattern "BuildConfig\." | Where-Object { $_.Line -notmatch "//|spec|test|BuildConfig\.DEBUG|BuildConfig\.VERSION" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

**bash:**
```
grep -rn "remoteConfig\|getBoolean\|getValue" app/src --include="*.kt" | grep -v "//.*\|spec\|test" | head -20
```
**PowerShell:**
```
Get-ChildItem -Path app/src -Recurse -Include "*.kt" -ErrorAction SilentlyContinue | Select-String -Pattern "remoteConfig|getBoolean|getValue" | Where-Object { $_.Line -notmatch "//|spec|test" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

Append results to `flag-scratch.md` under `# Android`. Go to Step 3.

---

## Step 3 — Find iOS / Swift feature flags

**bash:**
```
grep -rn "FeatureFlag\|featureFlag\|isEnabled\|FeatureToggle\|FEATURE_\|FF_" . --include="*.swift" | grep -v "//.*\|spec\|test\|mock" | head -40
```
**PowerShell:**
```
Get-ChildItem -Recurse -Include "*.swift" -ErrorAction SilentlyContinue | Select-String -Pattern "FeatureFlag|featureFlag|isEnabled|FeatureToggle|FEATURE_|FF_" | Where-Object { $_.Line -notmatch "//|spec|test|mock" } | Select-Object Path, LineNumber, Line | Select-Object -First 40
```

Append results to `flag-scratch.md` under `# iOS`. Go to Step 4.

---

## Step 4 — Find local config / JSON flag files

**bash:**
```
find . -name "feature*.json" -o -name "flags*.json" -o -name "feature*.properties" | head -10
```
**PowerShell:**
```
Get-ChildItem -Recurse -Include "feature*.json","flags*.json","feature*.properties" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 10
```

Read each file found. Append to `flag-scratch.md` under `# ConfigFiles`. Go to Step 5.

---

## Step 5 — Count usages of each flag found

For each unique flag name discovered in Steps 1–4, search for all usages across the codebase.

### Angular

**bash:**
```
grep -rn "featureFlag\|isEnabled" src --include="*.ts" --include="*.html" | head -30
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts","*.html" -ErrorAction SilentlyContinue | Select-String -Pattern "featureFlag|isEnabled" | Select-Object Path, LineNumber, Line | Select-Object -First 30
```

### Android + iOS

**bash:**
```
grep -rn "FeatureFlag\|isEnabled" app/src --include="*.kt" | head -20
```
**PowerShell:**
```
Get-ChildItem -Path app/src -Recurse -Include "*.kt" -ErrorAction SilentlyContinue | Select-String -Pattern "FeatureFlag|isEnabled" | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

Append results to `flag-scratch.md` under `# Usages`. Go to Step 6.

---

## Step 6 — Write the inventory report

Read `flag-scratch.md` in full. Write `FLAG-INVENTORY-[YYYY-MM-DD].md` at the project root. Delete `flag-scratch.md`. This is the only step that produces user-visible output.

```markdown
# Feature Flag Inventory — [Project Name]

**Generated:** [today's date]
**Platforms scanned:** [Angular / Android / iOS]

> This report lists all feature flags found in the codebase.
> Do NOT remove any flag without confirming its rollout status with the feature owner first.

---

## Flag Inventory

| Flag Name | Platform | Definition File | Usage Count | Suggested Action |
|-----------|----------|----------------|-------------|-----------------|
| `NEW_DASHBOARD` | Angular | `src/core/flags.ts:12` | 4 | Confirm with team |
| `FEATURE_BIOMETRIC` | Android | `app/src/.../FeatureFlags.kt:8` | 2 | Confirm with team |

---

## Flag Usages Detail

### [Flag Name]

**Defined in:** `full/path/to/file.ts:line`
**Used in:**
- `full/path/to/component.ts:34` — guards `showNewDashboard()`
- `full/path/to/template.html:12` — guards `<app-new-dashboard>`

**Dead code if permanently ON:** `showLegacyDashboard()` call at `file.ts:40`
**Dead code if permanently OFF:** entire `if` block at `file.ts:33–45`

---

## Removal Guide (apply manually after team confirms flag status)

### If flag is permanently ON — keep the true branch, delete the guard

**Angular:**
```typescript
// Before
if (this.featureFlags.isEnabled('new-dashboard')) {
  this.showNewDashboard();
} else {
  this.showLegacyDashboard();
}

// After
this.showNewDashboard();
```

```html
<!-- Before -->
<app-new-dashboard *ngIf="flags.newDashboard; else legacy" />
<ng-template #legacy><app-legacy-dashboard /></ng-template>

<!-- After -->
<app-new-dashboard />
```

**Android:**
```kotlin
// Before
if (FeatureFlags.isEnabled(Flag.NEW_PAYMENT_FLOW)) {
    startActivity(Intent(this, NewPaymentActivity::class.java))
} else {
    startActivity(Intent(this, LegacyPaymentActivity::class.java))
}

// After
startActivity(Intent(this, NewPaymentActivity::class.java))
```

**iOS:**
```swift
// Before
if FeatureFlags.isEnabled(.newOnboarding) {
    NewOnboardingView()
} else {
    LegacyOnboardingView()
}

// After
NewOnboardingView()
```

### If flag is permanently OFF — delete the entire block

**Angular:**
```typescript
// Before
if (this.featureFlags.isEnabled('experimental-search')) {
  this.initExperimentalSearch();
}
// After — delete the entire if block
```

### After removing usages — remove the flag definition

Remove the entry from the flags enum/object/class, from Remote Config defaults, and from any backend flag management system.

---

## Post-removal checklist

- [ ] Build passes: `ng build` / `./gradlew assembleDebug` / Xcode build
- [ ] Flag definition removed from source
- [ ] Flag removed from Remote Config / backend dashboard
- [ ] Dead component/screen files deleted if no longer referenced
- [ ] Commit message names the flag: `remove feature flag: new-dashboard (100% rollout)`
```

---

## Guidelines

- Never remove a flag without confirming its rollout status with the feature owner
- Remove one flag per PR to keep diffs reviewable
- If a flag is partially rolled out (e.g. 50% of users), it is active — do not touch it
- For Remote Config flags: coordinate backend removal with app releases to avoid crashes on old versions
