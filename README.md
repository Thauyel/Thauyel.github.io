## Welcome to My Portfolio on GitHub

**Hi!** 👋

This is the web version of my arch portfolio. This repository hosts the files for my portfolio website, showcasing my academic projects and designs.

I invite you to explore my projects via the link below.

Thanks for stopping by!

---

👉 **[Click Here to Enter the Portfolio](https://thauyel.vercel.app)**

A quick tip: There is an easter egg on the website. Just click my face!


## Local development

Serve the repository with Python (no application dependencies or build step):

```sh
python3 -m http.server 8000
```

Homepage interactions live in `js/portfolio.js`. Gallery previews use committed
WebP files under `thumbnails/`; each image's `data-full` attribute points to the
unchanged original under `src/`. The lightbox uses those originals, including
when navigating between images. Panorama viewing also uses the original files.

To add a gallery image, reference its original in `data-full` and its matching
WebP preview in `src`, then regenerate thumbnails. The generator preserves
aspect ratios, applies EXIF orientation and converts wide-gamut sources (such as
iPhone Display P3 photos) to sRGB. Gallery previews have a maximum edge of 640
pixels; the profile preview has a maximum edge of 256 pixels.

```sh
python3 -m venv /tmp/portfolio-images
/tmp/portfolio-images/bin/pip install Pillow==12.3.0
/tmp/portfolio-images/bin/python scripts/generate_thumbnails.py
```

When adding an image, set its HTML `width` and `height` to the generated preview's
dimensions and provide descriptive `alt` text. Thumbnail generation is only
needed when source images change; normal development and deployment need no
Python packages. `other/old.html` now redirects to the homepage.

### Pages under `other/`

- `game.html` — Neon Survivor, the easter egg behind the profile photo. Plain ES
  module (`game.js`) and stylesheet (`game.css`); no build step.
- `digit.html` — Digit Span. Its utility classes come from `digit-tailwind.css`, a
  static Tailwind build checked into the repository. After adding or changing
  Tailwind classes in `digit.html`, regenerate it (needs Node, not needed to serve
  the site):

  ```sh
  npx tailwindcss@3.4.17 --content ./other/digit.html -o ./other/digit-tailwind.css --minify
  ```


## Browser regression checks

With the site served locally, start a separate Chromium debugging session (in
Claude Code cloud containers the binary is `/opt/pw-browsers/chromium`):

```sh
chromium --headless --no-sandbox --disable-dev-shm-usage --remote-debugging-port=9222 --user-data-dir=/tmp/portfolio-test-browser
```

Then run the checks with Node 22 or newer:

```sh
node tests/browser-regression.mjs http://127.0.0.1:8000 http://127.0.0.1:9222
```

The runner opens and closes its own browser tab. It checks nested gallery scroll
locks and mouse/touch state resets on the homepage; digit-game scoring, keyboard
input and pause timing; and, for Neon Survivor, the single animation loop,
death versus level-up ordering, restart resets, weapon targeting, shop and
level-up flows, redraw on resize, balanced canvas state and a long simulated run
through boss waves. It disables caching for the test tab so checks exercise the
current files.
