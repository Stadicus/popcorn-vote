# Popcorn Vote project website

This directory is the generated, self-contained static marketing site. Upload its contents (including `assets/` and the language directories) to the document root on the VPS; no build step, app runtime, or third-party font request is required there. The bundled DM Mono, DM Sans, and Nunito Sans files are licensed under the SIL Open Font License; copies are stored alongside the fonts in `assets/fonts/`.

The maintainable source lives in `docs/website-src/`. After changing its template, messages, or reviewed translation overrides, regenerate the deployable files from the repository root:

```sh
node docs/website-src/generate.mjs
```

The current screen-share recording is included as `assets/popcorn-vote-v1.mp4` and rendered with native browser controls. Add a caption track before public release if the recording contains spoken narration.

The canonical production host is `https://popcornvote.org/`. The root is the `x-default` language gateway; each translation has its own canonical subdirectory URL and reciprocal `hreflang` links. Keep the template, generator, `robots.txt`, and sitemap generation in step if the domain changes: canonical, Open Graph, structured-data, and sitemap URLs are absolute by design. After deployment, submit `https://popcornvote.org/sitemap.xml` in Google Search Console and validate the public pages with Google's Rich Results Test and the social-network sharing debuggers.

The website advertises the same nine languages as the application. Keep both locale lists in sync when adding or removing a language so a localized landing page always leads to an installation with the same interface language.
