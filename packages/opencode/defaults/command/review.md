---
description: Review a file or GitLab MR. Usage: /review <file-path-or-MR-URL>
---

Review the following: $ARGUMENTS

Route based on the argument:

**If the argument looks like a GitLab MR URL** (contains `/-/merge_requests/` or matches `project!123`):
- Call the `mr_review` tool with the URL to run the Go binary reviewer.

**If the argument is a file path** (exists on disk or ends with a known extension):
1. Read the file with the `read` tool.
2. Call `mage_boilerplate_review_rules` to get the team's review criteria.
3. Review the file against those criteria: check for correctness, style, security, and adherence to conventions.
4. Return a structured report with findings grouped by severity (critical / warning / suggestion / style).

**If neither**, tell the user the argument is not a recognized MR URL or file path.
