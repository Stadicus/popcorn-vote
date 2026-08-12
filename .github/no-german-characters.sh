#!/usr/bin/env bash
#
# Trips the build when German characters reappear outside translations and
# verifies that the committed static website matches its generator sources.
#
#   .github/no-german-characters.sh
#
# **Be honest about its reach: it matches umlauts and ß, nothing else.** "Woche",
# "Vorschlag" and "der Film" walk straight past it. This is a tripwire for the
# common case, not a proof that the tree is English . the review stays the real
# gate. It exists because the cheap check is still worth having: after a sweep
# this large, the way German comes back is one comment at a time.
set -euo pipefail

# Source code and English documentation. Translation catalogues are excluded.
roots=(
src e2e static .github docs
svelte.config.js vite.config.ts playwright.config.ts eslint.config.js tsconfig.json
.gitattributes .prettierignore
README.md CHANGELOG.md SPECIFICATION.md DOCUMENTATION.md SECURITY.md CONTRIBUTING.md
CODE_OF_CONDUCT.md
config.example.yaml .env.example docker-compose.yml Dockerfile render.yaml
)

# Every root has to exist, or a rename would quietly shrink what is scanned and
# this script would still report success.
for root in "${roots[@]}"; do
if [ ! -e "$root" ]; then
echo "$0: '$root' does not exist . the scan would silently cover less." >&2
exit 1
fi
done

# The multilingual catalogue file is allow-listed below, but its English source
# array must still obey the repository's English-only rule.
node <<'NODE'
const { messages } = require('./docs/website-src/messages.json');
const overrides = require('./docs/website-src/overrides.json');
const germanCharacters = /[äöüÄÖÜß\u0308]/u;
messages.en.forEach((message, index) => {
	const effectiveMessage = overrides.en?.[index] ?? message;
	if (germanCharacters.test(effectiveMessage)) {
		console.error(`German characters found in English website message ${index}: ${effectiveMessage}`);
		process.exitCode = 1;
	}
});
NODE

# The static website is deployed directly from its committed generated output.
# Regenerate it before scanning so CI also catches changed, missing, untracked,
# or obsolete locale pages instead of reviewing source and deploying stale files.
node docs/website-src/generate.mjs --check
untracked_website=$(git ls-files --others --exclude-standard -- docs/website)
if ! git diff --quiet -- docs/website || [ -n "$untracked_website" ]; then
	echo "$0: docs/website is not in sync with docs/website-src." >&2
	git diff --name-status -- docs/website >&2
	printf '%s\n' "$untracked_website" >&2
	echo "Run 'node docs/website-src/generate.mjs' and commit the generated output." >&2
	exit 1
fi

# Paths that carry German characters on purpose. Every entry is a decision, not
# a leftover; extending this list needs a reason in the same commit.
allow=(
	# slugify() transliterates umlauts into person ids ("Müller" -> "mueller").
	# Changing that would orphan every token belonging to an existing id.
	'^src/lib/server/config\.ts:'
	# Prose about how uppercasing "ß" behaves, and "ßeta" as its test case.
	'^src/lib/member\.ts:'
	'^src/lib/member\.test\.ts:'
	# German test data on purpose: umlaut collation and the German CSV dialect.
	'^src/lib/server/views\.test\.ts:'
	'^src/lib/server/csv\.test\.ts:'
	# These assert German catalogue text, which is the whole point of them.
	'^src/lib/tokentext\.test\.ts:'
	'^src/lib/server/api\.test\.ts:'
	# Fixture changelogs for release-notes.sh; their prose is arbitrary filler.
	'^\.github/testdata/'
	# The marketing-site source contains reviewed translations, while its generated
	# output repeats native language names in every locale switcher. Both are
	# deliberately multilingual user-facing content, not German implementation text.
	'^docs/website-src/(messages|overrides)\.json:'
	# The generated x-default gateway previews its language prompt in four
	# languages so visitors can recognize the selector before auto-detection.
	'^docs/website-src/generate\.mjs:[0-9]+:[^äöüÄÖÜß\x{0308}]*Sprache wählen[^äöüÄÖÜß\x{0308}]*$'
	# Generated locale pages and the x-default gateway repeat native language
	# names and localized copy. Hand-maintained website documentation stays scanned.
	'^docs/website/(index\.html|(?:en|de|es|fr|pt-br|it|pl|tr|ja)/index\.html):'
	# This script has to name the characters it looks for.
	'^\.github/no-german-characters\.sh:'
	# Native language names are shown in the language switcher.
	'^src/lib/i18n/locales\.ts:.*Türkçe'
	# Documentation that talks *about* umlauts: the reach of this very script,
	# the transliteration in slugify(), and a German date as a formatting
	# example. Matched on their wording, not their line numbers, so the entries
	# survive an edit above them. Looser than the CONTRIBUTING entry below on
	# purpose: these two also quote "Müller" and "März" as examples.
	'^CHANGELOG\.md:[0-9]+:.*(umlauts and ß|Müller|März)'
	# CONTRIBUTING.md names the characters this script looks for. The pattern
	# accepts a line only when the literal phrase is its sole source of German
	# characters . anything German beside it, same line included, still trips.
	# The phrase has to sit lowercase and unbroken on one line: a reflow or a
	# sentence-case "Umlauts" fails loudly, and the fix is widening this entry.
	'^CONTRIBUTING\.md:[0-9]+:[^äöüÄÖÜß\x{0308}]*(umlauts and ß[^äöüÄÖÜß\x{0308}]*)*$'
)

# `grep` exits 1 for "no match" and 2 for a real error. Only the first is fine;
# swallowing both would turn a broken scan into a green run.
set +e
# -I skips binary files: the app icons contain matching bytes by chance.
# \x{0308} is the combining diaeresis: an "ä" typed on a Mac often arrives
# decomposed as "a" plus that mark, and would otherwise walk past the class.
hits=$(grep -rnPI '[äöüÄÖÜß\x{0308}]' "${roots[@]}")
status=$?
set -e
if [ "$status" -gt 1 ]; then
echo "$0: grep failed with $status . the scan did not complete." >&2
exit 1
fi

# The same exit-code rule applies here: a typo in an allow pattern makes `grep`
# fail with 2 and hand back an empty string, which would silently drop every hit
# of the whole run, not just the ones the pattern meant to cover.
for pattern in "${allow[@]}"; do
	set +e
	hits=$(printf '%s\n' "$hits" | grep -vP "$pattern")
	status=$?
	set -e
	if [ "$status" -gt 1 ]; then
		echo "$0: the allow pattern '$pattern' is not valid . the scan did not complete." >&2
		exit 1
	fi
done

hits=$(printf '%s\n' "$hits" | { grep -v '^$' || true; })

if [ -n "$hits" ]; then
	echo "German characters found where the tree should be English:" >&2
	printf '%s\n' "$hits" >&2
	echo >&2
	echo "If a hit is deliberate, add its path to the allow list in $0 with a reason." >&2
	exit 1
fi

echo "No German characters found."
