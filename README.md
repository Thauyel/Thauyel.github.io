## Welcome to My Portfolio on GitHub

**Hi!** 👋

This is the web version of my arch portfolio. This repository hosts the files for my portfolio website, showcasing my academic projects and designs.

I invite you to explore my projects via the link below.

Thanks for stopping by!

---

👉 **[Click Here to Enter the Portfolio](https://thauyel.vercel.app)**

A quick tip: There are easter eggs on the website. Click my face, or the word "Architect" under my name!


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
canvas state restoration during screen shake, and plays through a Neon Horde
run (see below). It disables caching for the test tab so checks exercise the
current files.


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


## Neon Horde (other/bh/)

`other/bh/` holds **Neon Horde**, a bullet-heaven roguelite in the style of
Vampire Survivors. You only steer and every weapon fires on its own. Survive
fifteen minutes on one of three stages (Neon Grid, Crystal Wastes, Void Core)
while the swarm grows every minute, bosses arrive every three minutes and The
Purger hunts you after 15:00. There are nine ships, twelve weapons, each with an
evolution unlocked by a paired passive module and a boss or elite cache, fourteen
modules and fourteen run-wide relics. Level-ups offer limited Reroll, Skip and
Banish charges. Runs are self-contained: only settings and per-stage high scores
are kept in `localStorage`. It plays with keyboard, touch (floating joystick) or
a gamepad. Everything is drawn on canvas and every sound is synthesized with
WebAudio, so there are no image or audio assets and no build step.

The simulation (`other/bh/js/game.js`, `weapons.js`, `enemies.js`) has no DOM
dependencies. A built-in autopilot plays full runs headlessly to check that the
simulation stays finite, bounded and deterministic, that every weapon and
evolution deals damage, and that each stage's timeline reaches the clear:

```sh
node tests/bh-sim.mjs          # every stage with three ships
node tests/bh-sim.mjs --full   # every ship on every stage
```

The browser regression checks above also drive a Neon Horde run through the
relic, level-up, reroll, evolution, pause, results and retry flows.
