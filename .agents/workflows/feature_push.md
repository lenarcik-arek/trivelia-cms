---
description: Formalized process for completing a feature or fix in the CMS, ensuring SDD consistency and project cleanliness.
---

1. **TESTS (Rule #2):** Run `npm test` or dedicated tests for the modified modules. If tests fail, fix the errors before proceeding.
2. **SPEC SYNC (SDD):** Check the `SPEC.md` file. Update it with new parameters, Server Action endpoints, or architectural changes.
3. **LOGGING CHANGES (CHANGELOG):** Add an entry to `CHANGELOG.md` (following the latest version or a new dated entry). Focus on functional value.
4. **FREEZE (COMMIT):** Execute `git commit -m "feat/fix: [describe change]"` (or propose the command to the user).
5. **FINISH:** Inform the user with a short, specific summary consistent with Rule #6.
