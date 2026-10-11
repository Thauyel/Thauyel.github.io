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
aspect ratios and applies EXIF orientation. Gallery previews have a maximum
edge of 640 pixels; the profile preview has a maximum edge of 256 pixels.

```sh
python3 -m venv /tmp/portfolio-images
/tmp/portfolio-images/bin/pip install Pillow==12.3.0
/tmp/portfolio-images/bin/python scripts/generate_thumbnails.py
```

When adding an image, set its HTML `width` and `height` to the generated preview's
dimensions and provide descriptive `alt` text. Thumbnail generation is only
needed when source images change; normal development and deployment need no
Python packages. Older pages under `other/` retain their existing image paths.


## Browser regression checks

With the site served locally, start a separate Chromium debugging session. In
this cloud container:

```sh
chromium --headless --no-sandbox --disable-dev-shm-usage --remote-debugging-port=9222 --user-data-dir=/tmp/portfolio-test-browser
```

Then run the checks with Node 22 or newer:

```sh
node tests/browser-regression.mjs http://127.0.0.1:8000 http://127.0.0.1:9222
```

The runner opens and closes its own browser tab. It checks nested gallery scroll
locks, mouse/touch state resets, digit-game submission and pause behavior, and
canvas state restoration during screen shake. It disables caching for the test
tab so checks exercise the current files.


## Vertigo (other/game/)

`other/game/` holds **Vertigo**, an endless grappling-hook game through a
procedurally generated city. It has five architectural districts: Old Town,
Downtown, The Docks, Brutalia and Neon Arcology. Everything is drawn on canvas
and every sound is synthesized with WebAudio, so the game ships no image or audio
assets. Aim at the ceiling overhead with the mouse (or touch where to shoot),
hold (click, touch or Space) to grapple, and release to fly. A
"Daily City" mode gives everyone the same layout for the day.

The simulation in `other/game/js/world.js` has no DOM dependencies. A built-in
autopilot plays it headlessly to check that generated cities stay traversable:

```sh
node tests/vertigo-sim.mjs
```
