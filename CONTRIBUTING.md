# Contributing

An honest word first, the same one the [README](README.md) gives: pull
requests are not currently expected, and a submitted one will probably sit
there. The house rules are written down anyway — forks live by them too, and
"for now" is not "forever".

The rules are few but hard, and not obvious from the outside — they exist
because a merge here lands in living rooms overnight. This page is short on
purpose; the binding functional reference is [SPECIFICATION.md](SPECIFICATION.md),
every rule and edge case included. When the app and the specification
disagree, one of the two is a bug — say in the issue which one you think it is.

Feature requests are welcome as issues. Describe the problem you are trying to
solve and, if you have one, your proposed approach. They help shape the project,
but are not a promise that the request will be implemented.

However you take part — an issue, a security report, or a fork that comes back
here — the [Code of Conduct](CODE_OF_CONDUCT.md) applies.

## Workflow

- **Never commit on `main`.** Every change is a branch and a pull request.
- **Pull requests are squash-merged** — one PR becomes exactly one commit on
  `main`. It follows that PRs are never stacked on another PR's branch: one
  topic at a time against `main`.
- **A merge to `main` ships.** Every merge publishes the Docker image as
  `:latest`, and installations with automatic updates configured pull it
  overnight. Green checks alone are not a merge; a maintainer decides.
- **A release version needs a matching `## v<version>` section in
  `CHANGELOG.md`.** The release workflow publishes the corresponding image and
  release notes.

## Code

- **Everything is English** — identifiers, comments, file names, routes,
  commit messages, operator logs. The deliberate exceptions are the interface
  translations in `messages/` and input handled by `slugify()`. CI runs
  `.github/no-german-characters.sh`, a tripwire that catches German characters
  outside the files that carry them on purpose.
- **Visible text never goes into a component as a literal.** It belongs in every
  shipped catalogue under `messages/`; English is the source language.
- **Rule violations throw `RuleError` with a catalogue key**, never a finished
  sentence; the translation happens in one place. Operator-facing log lines
  are English and stay out of the catalogue — they are for whoever runs the
  container, not for the family.
- All the logic lives in `src/lib/server/`; Svelte components and routes stay
  thin.
- **The value unit is a vote on screen and a `token` in the code.** The split
  is deliberate — do not tidy one half into the other.

## Tests

- Unit tests sit as `*.test.ts` beside the code they test (`npm test`). A rule
  changes together with its tests.
- **No unit test writes to the file system.** Configuration fixtures live
  under `src/lib/server/testdata/` and are selected via `PV_CONFIG` — the
  `npm test` suite has to run in read-only environments.
- After changing visible text, check the E2E tests: several selectors hang on
  wording. `npm run build && npm run test:e2e` runs Playwright against the
  built server (Chromium locally; CI adds WebKit on pull requests).

## Getting started

```sh
npm install
npx svelte-kit sync                       # once — generates what `check` reads; dev does it too
DATA_DIR=./data PV_PIN=1234 npm run dev   # nothing useful starts without DATA_DIR/PIN
npm test                                  # unit tests
npm run lint && npm run check             # prettier + eslint, svelte-check
```
