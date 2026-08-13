# Popcorn Vote project website

This directory is the generated, self-contained static marketing site. Upload its contents (including `assets/` and the language directories) to the document root on the VPS; no build step, app runtime, or third-party font request is required there. The bundled DM Mono, DM Sans, and Nunito Sans files are licensed under the SIL Open Font License; copies are stored alongside the fonts in `assets/fonts/`.

The maintainable source lives in `docs/website-src/`. After changing its template, messages, reviewed translation overrides, or the FAQ catalogue, regenerate the deployable files from the repository root:

```sh
node docs/website-src/generate.mjs
```

Use `node docs/website-src/generate.mjs --check` for a read-only source/output comparison. Catalogue values are plain text and deliberately reject markup-significant ASCII characters (`"`, `<`, `>`, `&`, and `\`); use typographic quotation marks and words instead. This keeps the same reviewed copy safe in visible HTML, metadata attributes, and JSON-LD.

The current screen-share recording is included as `assets/popcorn-vote-v1.mp4` and rendered with native browser controls. Add a caption track before public release if the recording contains spoken narration.

The canonical production host is `https://popcornvote.org/`. The root is the `x-default` language gateway; each translation has its own canonical subdirectory URL and reciprocal `hreflang` links. Keep the template, generator, `robots.txt`, and sitemap generation in step if the domain changes: canonical, Open Graph, structured-data, and sitemap URLs are absolute by design. After deployment, submit `https://popcornvote.org/sitemap.xml` in Google Search Console and validate the public pages with Google's Rich Results Test and the social-network sharing debuggers.

The website advertises the same nine languages as the application. Keep both locale lists in sync when adding or removing a language so a localized landing page always leads to an installation with the same interface language.

## Reach measurement

The pages report to a self-hosted [Umami](https://umami.is) instance: no cookies, no fingerprint, no personal data, and nothing handed to a third party. Pageviews arrive on their own, and the generator adds a small script that reports six interactions a server log cannot show: `demo-click`, `github-click`, `outbound-click`, `media-kit-click`, `language-switch` (with both ends of the switch), and `video-play` (once per page, so a replay is not a second viewer). Link events carry the section they were clicked in. **The application itself is deliberately not tracked; this covers the marketing site only.**

The instance host and website id sit at the top of `generate.mjs`, and `data-domains` limits collection to `popcornvote.org`, so a fork, a local preview, or the Render test instance never reports into that dashboard. Two things have to agree for any of it to work: the host in `generate.mjs`, and the `script-src` and `connect-src` entries in the `Content-Security-Policy` of whatever serves the site. Change one without the other and the tracker still loads but silently reports nothing.
