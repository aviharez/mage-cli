---
description: Generate code from a boilerplate generator. Usage: /generate <type> <description>
---

Generate code using the team's boilerplate patterns.

**Request:** $ARGUMENTS

Steps:
1. Call `mage_boilerplate_context` with the generator type from the request (the first word, e.g. `component`, `service`, `store`).
2. If the tool returns an error saying no boilerplate is loaded, tell the user to run `/boilerplate add <name> <git-url>` first and stop.
3. Use the returned instruction and examples — plus the project conventions already injected into your system prompt — to generate the code.
4. Call the `write` tool to save each output file to the correct path.

If no type is given, call `mage_boilerplate_context` with type="" to list available generator types, then ask the user which one they want.
