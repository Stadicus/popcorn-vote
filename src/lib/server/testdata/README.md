# Test data

Fixed configuration files for the tests in `config.test.ts`, addressed through
the `PV_CONFIG` environment variable.

Deliberately checked in rather than written at runtime: the suite therefore
needs no write access at all and runs in environments that mount the file system
read-only (such as the Codex review, which works read-only on purpose). Whoever
needs a new case adds another file here instead of writing one in the test.

`retired-blocks.yaml` verifies warnings for unknown top-level blocks and a
misspelled nested key.
