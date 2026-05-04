---
description: Generate tests for a source file using boilerplate test patterns. Usage: /test <file>
---

Generate tests for the following file: $ARGUMENTS

Steps:
1. Read the source file with the `read` tool.
2. Call `mage_boilerplate_test_conventions` to get the team's test patterns and conventions.
3. Generate tests that follow those conventions exactly — same framework, same naming style, same structure.
4. Use the `write` tool to save the test file at the appropriate path (mirror the source path in the test directory), asking for confirmation.

If the file does not exist, tell the user.
