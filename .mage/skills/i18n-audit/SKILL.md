---
name: i18n-audit
description: Audit and fix internationalization issues across Angular, Kotlin Android, and SwiftUI codebases — find hardcoded strings, missing translations, and locale inconsistencies
---

# i18n Audit

Scan the codebase for internationalization issues and produce a report with specific file references and fix instructions.

## CONTRACT

- Do NOT stop between steps.
- Do NOT produce any text response until the final report is written.
- Write intermediate findings to `i18n-scratch.md` using tool calls.
- Always use FULL file paths when reading files.
- The task is complete only when `I18N-AUDIT-[YYYY-MM-DD].md` exists on disk.

---

## Step 0 — Detect OS

```
node -e "console.log(process.platform)"
```

- `win32` → **Windows**: use PowerShell commands in every step below.
- `darwin` / `linux` → **Unix**: use bash commands in every step below.

Write `OS=[result]` to `i18n-scratch.md`. Go to Step 1.

---

## Step 1 — Detect platforms and localization setup

**bash:** `ls`
**PowerShell:** `Get-ChildItem -Name`

### Check Angular localization

**bash:**
```
find src -name "*.xlf" -o -name "messages.*.json" -o -name "*.po" | head -10
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.xlf","messages.*.json","*.po" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 10
```

### Check Android localization

**bash:**
```
find . -type d -name "values*" | head -20
```
**PowerShell:**
```
Get-ChildItem -Recurse -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "values*" } | Select-Object -ExpandProperty FullName | Select-Object -First 20
```

### Check iOS localization

**bash:**
```
find . -name "*.strings" -o -name "*.xcstrings" | head -10
```
**PowerShell:**
```
Get-ChildItem -Recurse -Include "*.strings","*.xcstrings" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 10
```

Append all results to `i18n-scratch.md` under `# Setup`. Go to Step 2.

---

## Step 2 — Angular: find hardcoded strings in templates

### Raw text in HTML elements

**bash:**
```
grep -rn ">[a-zA-Z]" src --include="*.html" | grep -v "i18n\|translate\|<!--\|{{\|[@\[(]" | head -30
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.html" -ErrorAction SilentlyContinue | Select-String -Pattern ">[a-zA-Z]" | Where-Object { $_.Line -notmatch "i18n|translate|<!--|{{|[@\[(]" } | Select-Object Path, LineNumber, Line | Select-Object -First 30
```

### Hardcoded UI attribute values

**bash:**
```
grep -rn "placeholder=\|aria-label=\|title=\|alt=" src --include="*.html" | grep -v "i18n-\|{{\|\[\|translate" | head -20
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.html" -ErrorAction SilentlyContinue | Select-String -Pattern "placeholder=|aria-label=|title=|alt=" | Where-Object { $_.Line -notmatch "i18n-|{{|\[|translate" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

### Hardcoded strings in TypeScript files

**bash:**
```
grep -rn "title\s*=\s*['\"].\|message\s*=\s*['\"].\|label\s*=\s*['\"]." src --include="*.ts" | grep -v "spec\|test\|mock\|//" | head -20
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "title\s*=\s*['""]|message\s*=\s*['""]|label\s*=\s*['""]" | Where-Object { $_.Line -notmatch "spec|test|mock|//" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

Append results to `i18n-scratch.md` under `# AngularHardcoded`. Go to Step 3.

---

## Step 3 — Android: find hardcoded strings

### Hardcoded text in XML layouts

**bash:**
```
grep -rn "android:text=\"[^@]" app/src/main/res/layout/ | head -20
```
**PowerShell:**
```
Get-ChildItem -Path app/src/main/res/layout -Recurse -Include "*.xml" -ErrorAction SilentlyContinue | Select-String -Pattern 'android:text="[^@]' | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

**bash:**
```
grep -rn "android:hint=\"[^@]\|android:contentDescription=\"[^@]" app/src/main/res/layout/ | head -20
```
**PowerShell:**
```
Get-ChildItem -Path app/src/main/res/layout -Recurse -Include "*.xml" -ErrorAction SilentlyContinue | Select-String -Pattern 'android:hint="[^@]|android:contentDescription="[^@]' | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

### Hardcoded strings in Kotlin files

**bash:**
```
grep -rn "setText(\"\|Toast\.makeText.*\"" app/src/main/java/ --include="*.kt" | head -20
```
**PowerShell:**
```
Get-ChildItem -Path app/src/main/java -Recurse -Include "*.kt" -ErrorAction SilentlyContinue | Select-String -Pattern 'setText\("|Toast\.makeText.*"' | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

Append results to `i18n-scratch.md` under `# AndroidHardcoded`. Go to Step 4.

---

## Step 4 — iOS: find hardcoded strings

**bash:**
```
grep -rn "Text(\"" . --include="*.swift" | grep -v "LocalizedStringKey\|localized\|NSLocalizedString\|spec\|test" | head -20
```
**PowerShell:**
```
Get-ChildItem -Recurse -Include "*.swift" -ErrorAction SilentlyContinue | Select-String -Pattern 'Text\("' | Where-Object { $_.Line -notmatch "LocalizedStringKey|localized|NSLocalizedString|spec|test" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

**bash:**
```
grep -rn "Label(\"\|\.placeholder(\"" . --include="*.swift" | head -20
```
**PowerShell:**
```
Get-ChildItem -Recurse -Include "*.swift" -ErrorAction SilentlyContinue | Select-String -Pattern 'Label\("|\.placeholder\("' | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

Append results to `i18n-scratch.md` under `# iOSHardcoded`. Go to Step 5.

---

## Step 5 — Check for missing translation keys

### Android: list string keys in default locale

**bash:**
```
grep -o "name=\"[^\"]*\"" app/src/main/res/values/strings.xml | head -50
```
**PowerShell:**
```
Get-Content app/src/main/res/values/strings.xml -ErrorAction SilentlyContinue | Select-String -Pattern 'name="[^"]*"' | Select-Object -First 50
```

### Android: find locale string directories

**bash:**
```
find app/src/main/res -type d -name "values-*" | head -10
```
**PowerShell:**
```
Get-ChildItem -Path app/src/main/res -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "values-*" } | Select-Object -ExpandProperty FullName | Select-Object -First 10
```

Read each `strings.xml` found in the locale directories. Compare key names against the default `strings.xml` and note any that are missing.

### Angular: check for locale message files

**bash:**
```
find src/locale -name "messages.*.xlf" | head -10
```
**PowerShell:**
```
Get-ChildItem -Path src/locale -Include "messages.*.xlf" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 10
```

Read each locale file found. Compare `id` attributes against the source `messages.xlf` and note missing ones.

Append results to `i18n-scratch.md` under `# MissingKeys`. Go to Step 6.

---

## Step 6 — Check locale-aware formatting

### Angular: hardcoded currency/number formatting

**bash:**
```
grep -rn "Rp \|IDR \|\`Rp\|\`IDR" src --include="*.ts" --include="*.html" | head -20
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts","*.html" -ErrorAction SilentlyContinue | Select-String -Pattern "Rp |IDR |``Rp|``IDR" | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

### Android: hardcoded currency formatting

**bash:**
```
grep -rn "\"Rp \|\"IDR \|Rp \$\|IDR \$" app/src --include="*.kt" | head -20
```
**PowerShell:**
```
Get-ChildItem -Path app/src -Recurse -Include "*.kt" -ErrorAction SilentlyContinue | Select-String -Pattern '"Rp |"IDR |Rp \$|IDR \$' | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

### Angular: check for RTL-incompatible CSS

**bash:**
```
grep -rn "margin-left\|padding-left\|text-align: left\|float: left" src --include="*.scss" --include="*.css" | head -20
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.scss","*.css" -ErrorAction SilentlyContinue | Select-String -Pattern "margin-left|padding-left|text-align: left|float: left" | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

### Android: hardcoded layout direction

**bash:**
```
grep -rn "layout_marginLeft\|layout_marginRight\|gravity=\"left\"\|gravity=\"right\"" app/src/main/res/layout/ | head -20
```
**PowerShell:**
```
Get-ChildItem -Path app/src/main/res/layout -Recurse -Include "*.xml" -ErrorAction SilentlyContinue | Select-String -Pattern 'layout_marginLeft|layout_marginRight|gravity="left"|gravity="right"' | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

Append results to `i18n-scratch.md` under `# Formatting`. Go to Step 7.

---

## Step 7 — Write the audit report

Read `i18n-scratch.md` in full. Write `I18N-AUDIT-[YYYY-MM-DD].md` at the project root. Delete `i18n-scratch.md`. This is the only step that produces user-visible output.

```markdown
# i18n Audit — [Project Name]

**Generated:** [today's date]
**Platforms audited:** [Angular / Android / iOS]
**Target locale:** id (Indonesian)

---

## Summary

| Category | Issues Found |
|----------|-------------|
| Hardcoded strings — Angular templates | [n] |
| Hardcoded strings — Angular TypeScript | [n] |
| Hardcoded strings — Android XML | [n] |
| Hardcoded strings — Android Kotlin | [n] |
| Hardcoded strings — iOS Swift | [n] |
| Missing translation keys | [n] |
| Non-locale-aware formatting | [n] |
| RTL / layout direction | [n] |

---

## Hardcoded Strings

### Angular

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `path/to/file.html` | 12 | Raw text "Submit" | Add `i18n="@@submitButton"` or use `translate` pipe |

### Android

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `path/to/layout.xml` | 5 | `android:text="Submit"` | Change to `android:text="@string/submit_button"` |

### iOS

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `path/to/View.swift` | 23 | `Text("Welcome")` | Add key to `Localizable.xcstrings` |

---

## Missing Translation Keys

### Android — missing in `values-id`

| Key | Present in default | Present in id |
|-----|--------------------|---------------|
| `submit_button` | ✓ | ✗ |

### Angular — missing in `messages.id.xlf`

| Key ID | Status |
|--------|--------|
| `@@submitButton` | Missing |

---

## Non-Locale-Aware Formatting

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `path/to/file.ts` | 10 | `` `Rp ${amount}` `` | Use `currency:'IDR'` pipe or `NumberFormat.getCurrencyInstance` |

---

## RTL / Layout Direction

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `path/to/style.scss` | 8 | `margin-left` | Use `margin-inline-start` |

---

## Fix Reference

| Platform | Issue | Fix |
|----------|-------|-----|
| Angular | Raw text in template | `<tag i18n="@@key">text</tag>` or `{{ 'KEY' \| translate }}` |
| Angular | Hardcoded attribute | `i18n-placeholder="@@key" placeholder="text"` |
| Angular | Currency formatting | `{{ amount \| currency:'IDR':'symbol':'1.0-0' }}` |
| Angular | RTL margin | Replace `margin-left` with `margin-inline-start` |
| Android | Hardcoded XML text | Move to `strings.xml`, use `@string/key` |
| Android | Hardcoded Kotlin string | Use `getString(R.string.key)` |
| Android | Currency formatting | `NumberFormat.getCurrencyInstance(Locale("id","ID")).format(amount)` |
| Android | RTL layout | Use `layout_marginStart` / `layout_marginEnd`, `gravity="start"` |
| iOS | `Text("literal")` | Add key to `Localizable.xcstrings`, use `Text("key")` |
| iOS | Currency formatting | `Text(amount, format: .currency(code: "IDR"))` |
```

---

## Guidelines

- Audit one platform at a time to keep changes reviewable
- Never translate directly in source code — always use a key-based lookup
- Default locale for BCA app is `id` (Indonesian)
- String keys should be `snake_case` and describe context, not content
- Run a build after extraction to confirm no broken references
