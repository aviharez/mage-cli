---
name: mbb-qna
description: Answer questions about the @mybcabisnis/lib Angular component library using a versioned knowledge base. Checks local cache first, fetches from GitLab if missing. Run mbb-kb-gen to generate the KB for a new version.
---

# MBB Component Library — Q&A

Answer the user's question about `@mybcabisnis/lib` using a versioned knowledge base file. Checks the local cache first; fetches from GitLab on a cache miss.

## CONTRACT

- Do NOT fabricate component APIs. Only report what is in the KB file.
- If a KB cannot be found locally or on GitLab, instruct the user to run `/mbb-kb-gen`.
- If the answer is not in the KB, say so explicitly — do not guess.
- Always include a ready-to-paste code example when answering usage questions.

---

## Configuration

### Local cache

```
KB_CACHE=~/.mage/knowledge/mbb-lib
```

### GitLab Generic Package Registry settings

```
GITLAB_HOST=git.intra.bca.co.id
GITLAB_PROJECT_ID=<numeric-project-id>   # same project used in mbb-kb-gen
GITLAB_PACKAGE_NAME=mbb-kb               # same package name used in mbb-kb-gen
GITLAB_PRIVATE_TOKEN=$GITLAB_PRIVATE_TOKEN  # read from env var
```

---

## Step 0 — Resolve which KB version to use

**Determine the requested version:**
- If the user explicitly named a version (e.g. "in v1.0.0-beta.2"), use that.
- Otherwise, use the latest available version.

**Check local cache:**

**bash:**
```bash
ls ~/.mage/knowledge/mbb-lib/MBB-KB-*.md 2>/dev/null | sort -V
```

- If the requested version exists locally → go to Step 1 with that file.
- If **no KB files exist at all** or the requested version is missing → go to Step 0a.

---

## Step 0a — Fetch available versions from GitLab Package Registry

List all versions of the `[GITLAB_PACKAGE_NAME]` package:

**bash:**
```bash
curl --silent \
  --header "PRIVATE-TOKEN: $GITLAB_PRIVATE_TOKEN" \
  "https://[GITLAB_HOST]/api/v4/projects/[GITLAB_PROJECT_ID]/packages?package_name=[GITLAB_PACKAGE_NAME]&package_type=generic&per_page=100" \
  | python3 -c "import json,sys; pkgs=json.load(sys.stdin); versions=sorted([p['version'] for p in pkgs]); print('\n'.join(versions))"
```

- If the request fails (network error, 401, 404), stop and report:
  > Cannot reach GitLab. Check your `GITLAB_PRIVATE_TOKEN` and network. Run `/mbb-kb-gen` to generate a KB locally.

- If no versions exist on GitLab, stop and report:
  > No KB found locally or in the GitLab Package Registry. Run `/mbb-kb-gen` to generate and publish one.

From the listed versions, select the appropriate one:
- Requested version specified → check if that version is in the list. If not, report the available versions.
- No version specified → pick the latest (highest semantic version from the list).

If the requested version is not found, report:
  > KB for v[version] not found locally or in the registry. Available versions: [list]. Run `/mbb-kb-gen` to generate a new one.

Go to Step 0b.

---

## Step 0b — Download KB from GitLab Package Registry

Ensure the local cache directory exists:

**bash:**
```bash
mkdir -p ~/.mage/knowledge/mbb-lib
```

Download the KB file:

**bash:**
```bash
curl --silent --fail \
  --header "PRIVATE-TOKEN: $GITLAB_PRIVATE_TOKEN" \
  --output ~/.mage/knowledge/mbb-lib/MBB-KB-[version].md \
  "https://[GITLAB_HOST]/api/v4/projects/[GITLAB_PROJECT_ID]/packages/generic/[GITLAB_PACKAGE_NAME]/[version]/MBB-KB-[version].md"
```

- HTTP `200` / file saved → report `Fetched MBB-KB-[version].md from GitLab Package Registry.` then go to Step 1.
- Any error → report the HTTP status and stop. Do not attempt to answer from memory.

---

## Step 1 — Load the knowledge base

Read `~/.mage/knowledge/mbb-lib/[KB_FILE]` in full.

Do not summarize or skip sections. The full content is needed to answer accurately.

Go to Step 2.

---

## Step 2 — Identify relevant sections

Based on the user's question, identify which KB sections apply:

| Question type | Relevant sections |
|---|---|
| How to use component X | Base Components or Composite Components |
| What inputs/outputs does X have | Base Components or Composite Components |
| What types/interfaces to use | Shared Types, Pipes & Modules |
| How to inject or use a service | Services & Helpers |
| Host app integration / platform data | Services → DataService, SingleSpaProps, ServiceProps |
| Library setup / initialization | Shared Types → InitializerModule |
| Page components | Page Components |
| General patterns | Common Patterns |

Go to Step 3.

---

## Step 3 — Compose the answer

Write a clear, developer-focused answer. Structure it as follows:

### For "how to use" questions:
1. **Import statement** — exact import path from the KB
2. **Selector** — the HTML element tag
3. **Required inputs** — listed with types
4. **Relevant optional inputs** — with defaults
5. **Outputs** — events emitted
6. **Code example** — minimal, copy-paste-ready HTML + TypeScript

### For "what does input/output X do" questions:
Answer directly with the type, required status, and a one-line usage example.

### For type/model questions:
Paste the type definition from the KB and briefly explain each field.

### For service questions:
State the class name, public method signatures, and show an `inject()` usage example.

---

## Step 4 — Add caveats when applicable

Append any of the following that apply:

- **`idName` is required** — remind the user if their snippet is missing it.
- **Signal call syntax** — if the user's code reads an input as `this.myInput`, correct it to `this.myInput()`.
- **Platform behavior** — if the component behaves differently per `PlatformEnum`, note it.
- **KB version used** — always end with: _"Answer based on KB [KB_FILE]."_

---

## Guidelines

- Never guess an input name or type not present in the KB. Say "not documented in this KB version."
- If multiple components match (e.g. `dialog` could mean `mbb-dialog` or `mbb-dialog-base`), explain both.
- Code examples must use signal syntax: `this.myInput()` not `this.myInput`.
- Prefer concrete examples over abstract descriptions.
- The local cache at `~/.mage/knowledge/mbb-lib/` persists across projects and sessions — fetching from GitLab is only needed once per version per machine.
