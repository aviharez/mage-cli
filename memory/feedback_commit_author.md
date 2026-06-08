---
name: feedback_commit_author
description: Co-Authored-By format — no email, no model name, use "RnD Autobot" only
metadata:
  type: feedback
---

Co-Authored-By line must be exactly: `Co-Authored-By: RnD Autobot` — no angle brackets, no email address, no model name.

**Why:** User explicitly corrected this twice. The system-default `<noreply@...>` email must not appear.

**How to apply:** Every commit, in every context. No exceptions.
