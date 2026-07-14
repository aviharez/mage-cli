# Mermaid Escaping Rules

Apply these rules to **every** node label, edge label, and sequence message before writing a `mermaid` code block. A single unescaped special character will break the entire diagram.

---

## Rule 1 — Always quote node labels

Wrap every label in double quotes, even if the text looks simple.

```
✓  A["Dashboard"]
✗  A[Dashboard]

✓  B(["User taps Submit"])
✗  B(User taps Submit)

✓  C[["ServiceName.getList"]]
✗  C[[ServiceName.getList()]]
```

This applies to all node shapes: `[ ]`, `[[ ]]`, `([ ])`, `{ }`, `(( ))`.

---

## Rule 2 — Entity-encode special characters inside labels

Mermaid uses `#NN;` numeric HTML entity codes. Replace these characters **inside any label string**:

| Character | Entity code | Example |
|-----------|-------------|---------|
| `(` | `#40;` | `getUser(id)` → `getUser#40;id#41;` |
| `)` | `#41;` | (see above) |
| `{` | `#123;` | `{ key: val }` → `#123;key: val#125;` |
| `}` | `#125;` | (see above) |
| `[` | `#91;` | `array[0]` → `array#91;0#93;` |
| `]` | `#93;` | (see above) |
| `<` | `#60;` | `List<User>` → `List#60;User#62;` |
| `>` | `#62;` | (see above) |
| `#` | `#35;` | `#123;` literal in a label is rare — escape if needed |
| `;` | `#59;` | rarely appears in labels; escape if present |
| `\|` | `#124;` | `a\|b` → `a#124;b` |
| `&` | `#amp;` | `foo&bar` → `foo#amp;bar` |
| `"` | `#quot;` | nested quote → `say#quot;hello#quot;` |

**Slashes `/` are safe** — do not escape them. `GET /api/v1/users` is fine as-is inside a label.

**Dots `.` are safe** — `ServiceName.method` does not need escaping.

**Colons `:` are safe inside labels** (they are only special in sequence message syntax outside quotes).

---

## Rule 3 — Keep node IDs alphanumeric

Node IDs (the left-hand side before the shape brackets) must contain only letters and digits. Use descriptive IDs but no spaces or punctuation.

```
✓  SVC[["ServiceName.getList"]]
✗  SVC.getList[["ServiceName.getList"]]

✓  B1(["step one"])
✗  B-1(["step one"])
```

---

## Rule 4 — Sequence diagram messages

In `sequenceDiagram`, text after the arrow and colon is message text. Keep it short; for anything containing parens, generics, or braces, wrap the whole message in `"..."`:

```
✓  UI->>SVC: getList()
✓  UI->>SVC: "getUser#40;id#41;"
✗  UI->>SVC: getUser(id)

✓  SVC->>API: GET /api/v1/users
✓  SVC->>API: "POST /api/v1/users #123;username, password#125;"
✗  SVC->>API: POST /api/v1/users { username, password }
```

Notes in sequence diagrams use free text and rarely cause issues, but still avoid raw `{` `}` `[` `]` inside `Note over` text.

---

## Rule 5 — Line breaks

Use `<br/>` inside a label for a line break. Never use a literal newline inside a node label string.

```
✓  A["Step one<br/>Step two"]
✗  A["Step one
    Step two"]
```

---

## Before / After examples (common breakages)

| ❌ Breaks Mermaid | ✅ Fixed |
|-------------------|---------|
| `A[[ServiceName.getUser(id)]]` | `A[["ServiceName.getUser#40;id#41;"]]` |
| `B["Response { data: [] }"]` | `B["Response #123;data: #91;#93;#125;"]` |
| `C["List<User>"]` | `C["List#60;User#62;"]` |
| `D["status\|active"]` | `D["status#124;active"]` |
| `E --> F -- "a&b" --> G` | `E --> F -- "a#amp;b" --> G` |
| `SVC->>API: POST /path {body}` | `SVC->>API: POST /path #123;body#125;` |
| `UI->>UI: validate(form)` | `UI->>UI: "validate#40;form#41;"` |
| `D["GET /users?active=true"]` | `D["GET /users?active=true"]` ← `?` and `=` are safe |

---

## Quick self-check before finalising a diagram

1. Does every node label start and end with `"`?
2. Are there any raw `(` `)` `{` `}` `[` `]` `<` `>` `#` `|` `&` characters inside a label? If yes → replace with entity codes.
3. Do all node IDs contain only `[A-Za-z0-9]` and maybe `_`?
4. In sequence diagrams, does any message contain parens, braces, or generics? If yes → wrap in `"..."` and encode.
5. Are there literal newlines inside any label string? If yes → replace with `<br/>`.

If all five pass, the diagram is safe to render.
