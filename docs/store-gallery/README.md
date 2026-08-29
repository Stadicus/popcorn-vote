# Store gallery

Gallery images for app-store listings (Umbrel and others), 2880 × 1800, on a
shared background so the set reads as one. `1.jpg` to `5.jpg` are the slides;
The raw captures
are not committed (8 MB), `shoot.mjs` reproduces them into `shots/`. The film posters in these
images come from TMDB and are not covered by the repository licence; see
`THIRD_PARTY_NOTICES.md`.

## Rebuilding

The captures are taken from a demo instance, not by hand, so they can be
repeated after a UI change:

```sh
# 1. a demo instance with posters (needs a TMDB key)
PV_DEMO_DATA=true PV_PIN=2611 PV_MEMBERS=Anna,Ben,Carla,David \
  TMDB_API_KEY=… DATA_DIR=/tmp/pv-demo PORT=4180 node build/index.js

# 2. 3x iPhone captures plus the TV view; needs an emoji font (Noto Color Emoji)
node docs/store-gallery/shoot.mjs

# 3. the slides; needs Pillow, numpy and the Nunito Sans TTF next to render.py
#    (fontTools converts ../website/assets/fonts/nunito-sans-400-800-latin.woff2)
python3 docs/store-gallery/render.py
```
