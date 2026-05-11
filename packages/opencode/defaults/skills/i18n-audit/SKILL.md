---
name: i18n-audit
description: Audit and report internationalization issues across Angular, Kotlin Android, and SwiftUI codebases on Windows — find hardcoded strings, missing translations, locale-aware formatting issues, and RTL hazards. Windows-only (PowerShell or CMD).
---

# i18n Audit (Windows)

Scan the codebase for internationalization issues and produce a report with specific file references and fix instructions. Run from the project root.

> **Platform:** This skill runs on **Windows only** (PowerShell or CMD). It does not include bash variants. If `process.platform` is not `win32`, stop and tell the user this skill targets Windows.

## CONTRACT — read this first

This task has exactly one completion condition: the file `I18N-AUDIT-[YYYY-MM-DD].md` must exist on disk, written using the **Write tool**.

**ALL output — including the final report — must be written using tool calls (Write/Edit/Bash). Never print findings or the report as a chat message.**

Until that file is written using the Write tool:
- Do NOT produce any text response to the user.
- Do NOT summarize findings in text.
- Do NOT print the report content as a message — use the Write tool instead.
- Do NOT ask the user anything.
- Do NOT stop between steps.
- Write intermediate findings and progress to `i18n-scratch.md` using the Write/Edit tool (a tool call, not text).
- Always use FULL paths when reading files — never bare filenames.

The only acceptable output is tool calls, until `I18N-AUDIT-[YYYY-MM-DD].md` is written to disk.

---

## Step 0 — Confirm Windows + detect shell

**Run:**
```
node -e "console.log(process.platform)"
```

- If the result is **not** `win32`, stop immediately. Tell the user: "This skill targets Windows only. Detected platform: [X]." Do NOT proceed.
- If the result is `win32`, detect the shell:
  ```
  node -e "console.log(process.env.PSModulePath ? 'powershell' : 'cmd')"
  ```
  - Result `powershell` → write `OS=win32 SHELL=powershell` to `i18n-scratch.md`. Use **PowerShell** commands.
  - Result `cmd` → write `OS=win32 SHELL=cmd` to `i18n-scratch.md`. Use **CMD** commands.

Go to Step 1.

---

## Step 1 — Detect platforms and localization setup

**PowerShell:** `Get-ChildItem -Name`
**CMD:** `dir /b`

### Check Angular localization

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.xlf","messages.*.json","*.po" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 10
```
**CMD:**
```
dir /s /b src\*.xlf src\messages.*.json src\*.po 2>nul
```

### Check Android localization

**PowerShell:**
```
Get-ChildItem -Recurse -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "values*" } | Select-Object -ExpandProperty FullName | Select-Object -First 20
```
**CMD:**
```
dir /s /b /ad values* 2>nul
```

### Check iOS localization

> iOS development typically requires macOS. On Windows you can still find string files if a Swift package is co-located in the repo, but no build verification is possible. Skip if no `*.swift` / `*.strings` / `*.xcstrings` files are present.

**PowerShell:**
```
Get-ChildItem -Recurse -Include "*.strings","*.xcstrings" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 10
```
**CMD:**
```
dir /s /b *.strings *.xcstrings 2>nul
```

Append all results to `i18n-scratch.md` under `# Setup`. Go to Step 2.

---

## Step 2 — Angular: find hardcoded strings in templates

### Raw text in HTML elements

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.html" -ErrorAction SilentlyContinue | Select-String -Pattern ">[a-zA-Z]" | Where-Object { $_.Line -notmatch "i18n|translate|<!--|{{|[@\[(]" } | Select-Object Path, LineNumber, Line | Select-Object -First 30
```
**CMD:**
```
findstr /s /n /r ">[a-zA-Z]" src\*.html 2>nul | findstr /v "i18n translate <!-- {{"
```

### Hardcoded UI attribute values

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.html" -ErrorAction SilentlyContinue | Select-String -Pattern "placeholder=|aria-label=|title=|alt=" | Where-Object { $_.Line -notmatch "i18n-|{{|\[|translate" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /c:"placeholder=" /c:"aria-label=" /c:"title=" /c:"alt=" src\*.html 2>nul | findstr /v "i18n- {{ translate"
```

### Hardcoded strings in TypeScript files

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "title\s*=\s*['""]|message\s*=\s*['""]|label\s*=\s*['""]" | Where-Object { $_.Line -notmatch "spec|test|mock|//" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /r /c:"title *= *[\"']" /c:"message *= *[\"']" /c:"label *= *[\"']" src\*.ts 2>nul | findstr /v "spec test mock //"
```

Append results to `i18n-scratch.md` under `# AngularHardcoded`. Go to Step 3.

---

## Step 3 — Android: find hardcoded strings

### Hardcoded text in XML layouts

**PowerShell:**
```
Get-ChildItem -Path app/src/main/res/layout -Recurse -Include "*.xml" -ErrorAction SilentlyContinue | Select-String -Pattern 'android:text="[^@]' | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /r /c:"android:text=\"[^@]" app\src\main\res\layout\*.xml 2>nul
```

**PowerShell:**
```
Get-ChildItem -Path app/src/main/res/layout -Recurse -Include "*.xml" -ErrorAction SilentlyContinue | Select-String -Pattern 'android:hint="[^@]|android:contentDescription="[^@]' | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /r /c:"android:hint=\"[^@]" /c:"android:contentDescription=\"[^@]" app\src\main\res\layout\*.xml 2>nul
```

### Hardcoded strings in Kotlin files

**PowerShell:**
```
Get-ChildItem -Path app/src/main/java -Recurse -Include "*.kt" -ErrorAction SilentlyContinue | Select-String -Pattern 'setText\("|Toast\.makeText.*"' | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /c:"setText(\"" /c:"Toast.makeText" app\src\main\java\*.kt 2>nul
```

Append results to `i18n-scratch.md` under `# AndroidHardcoded`. Go to Step 4.

---

## Step 4 — iOS: find hardcoded strings

> Skip this step entirely if no `*.swift` files are present. iOS dev is uncommon on Windows.

**PowerShell:**
```
Get-ChildItem -Recurse -Include "*.swift" -ErrorAction SilentlyContinue | Select-String -Pattern 'Text\("' | Where-Object { $_.Line -notmatch "LocalizedStringKey|localized|NSLocalizedString|spec|test" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /c:"Text(\"" *.swift 2>nul | findstr /v "LocalizedStringKey localized NSLocalizedString spec test"
```

**PowerShell:**
```
Get-ChildItem -Recurse -Include "*.swift" -ErrorAction SilentlyContinue | Select-String -Pattern 'Label\("|\.placeholder\("' | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /c:"Label(\"" /c:".placeholder(\"" *.swift 2>nul
```

Append results to `i18n-scratch.md` under `# iOSHardcoded`. Go to Step 5.

---

## Step 5 — Check for missing translation keys

### Android: list string keys in default locale

**PowerShell:**
```
Get-Content app/src/main/res/values/strings.xml -ErrorAction SilentlyContinue | Select-String -Pattern 'name="[^"]*"' | Select-Object -First 50
```
**CMD:**
```
findstr /n /r /c:"name=\"[^\"]*\"" app\src\main\res\values\strings.xml 2>nul
```

### Android: find locale string directories

**PowerShell:**
```
Get-ChildItem -Path app/src/main/res -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "values-*" } | Select-Object -ExpandProperty FullName | Select-Object -First 10
```
**CMD:**
```
dir /b /ad app\src\main\res\values-* 2>nul
```

Read each `strings.xml` found in the locale directories using the Read tool. Compare key names against the default `strings.xml` and note any that are missing.

### Angular: check for locale message files

**PowerShell:**
```
Get-ChildItem -Path src/locale -Include "messages.*.xlf" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 10
```
**CMD:**
```
dir /b src\locale\messages.*.xlf 2>nul
```

Read each locale file found. Compare `id` attributes against the source `messages.xlf` and note missing ones.

Append results to `i18n-scratch.md` under `# MissingKeys`. Go to Step 6.

---

## Step 6 — Check locale-aware formatting

### Angular: hardcoded currency / number formatting

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts","*.html" -ErrorAction SilentlyContinue | Select-String -Pattern "Rp |IDR |``Rp|``IDR" | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /c:"Rp " /c:"IDR " src\*.ts src\*.html 2>nul
```

### Android: hardcoded currency formatting

**PowerShell:**
```
Get-ChildItem -Path app/src -Recurse -Include "*.kt" -ErrorAction SilentlyContinue | Select-String -Pattern '"Rp |"IDR |Rp \$|IDR \$' | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /c:"\"Rp " /c:"\"IDR " app\src\*.kt 2>nul
```

### Angular: RTL-incompatible CSS

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.scss","*.css" -ErrorAction SilentlyContinue | Select-String -Pattern "margin-left|padding-left|text-align: left|float: left" | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /c:"margin-left" /c:"padding-left" /c:"text-align: left" /c:"float: left" src\*.scss src\*.css 2>nul
```

### Android: hardcoded layout direction

**PowerShell:**
```
Get-ChildItem -Path app/src/main/res/layout -Recurse -Include "*.xml" -ErrorAction SilentlyContinue | Select-String -Pattern 'layout_marginLeft|layout_marginRight|gravity="left"|gravity="right"' | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /c:"layout_marginLeft" /c:"layout_marginRight" /c:"gravity=\"left\"" /c:"gravity=\"right\"" app\src\main\res\layout\*.xml 2>nul
```

Append results to `i18n-scratch.md` under `# Formatting`. Go to Step 7.

---

## Step 7 — Write the audit report

**MANDATORY: Use the Write tool to write the file to disk. Do NOT print the report content as a chat message.**

1. Read `i18n-scratch.md` in full using the Read tool.
2. Call the **Write tool** with `file_path = I18N-AUDIT-[YYYY-MM-DD].md` and the full report as `content`. The file MUST be written to disk.
3. After the Write tool confirms success, delete `i18n-scratch.md`:
   - **PowerShell:** `Remove-Item i18n-scratch.md`
   - **CMD:** `del i18n-scratch.md`
4. Only after the file exists on disk, post a single short message: `i18n audit written to I18N-AUDIT-[YYYY-MM-DD].md`

Use ONLY information found in actual files. Reference exact file paths and line numbers. Do not flag issues that are already correctly implemented.

---

## Report structure

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
- This skill is Windows-only. If the user is on macOS or Linux, refer them to a different skill or ask them to run on a Windows machine.
