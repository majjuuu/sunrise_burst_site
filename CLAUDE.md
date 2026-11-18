# SunRISE Burst Detector — context for Claude Code

## What this project is
A website where Marquette students upload e-Callisto FIT files (radio spectrograms) and get back solar radio burst detections from the SunRISE team's YOLOv8 model.

- Owners: Erica Ma (interface + deployment) and Praneel (model wrapper + tests). This split is proposed, not final.
- Repo: github.com/majjuuu/sunrise_burst_site (public, GitHub Pages serves `main` at the root)
- Live demo: https://majjuuu.github.io/sunrise_burst_site/
- Model repo: https://github.com/Kasper-Heliophysics-MDP/TransferLearning_CNN

## Current state
The site is a front-end demo with no build step: `index.html`, `style.css`, `app.js`.
It draws a synthetic sample spectrogram and sample detections. **The model is not connected yet.**
Everything that talks to the model is in `runDetection()` in `app.js`. Setting `CONFIG.DETECT_URL` makes the page POST the uploaded file there.

## Backend contract (front end already expects this)
`POST /detect`, multipart form fields: `file`, `station`, `date`. Response JSON:
```json
{
  "startUtc": "18:00:00",
  "detections": [
    { "type": "III", "startSec": 218, "endSec": 252, "freqLow": 110, "freqHigh": 790, "confidence": 0.91 }
  ]
}
```
`startSec` and `endSec` are seconds from the start of the 15-minute window.
Changing this shape means changing `app.js` too. Flag that before doing it.

## Facts about the model (from the model repo's README)
- YOLOv8s (ultralytics), COCO-pretrained, fine-tuned on e-Callisto spectrograms.
- Works on fixed **15-minute windows**, rendered from `.npy` arrays to images.
- Detects Type II, III, V bursts. Reported Type III: 92% detection, 5.0 s median timing error.
- Rendering choice changes results a lot: on own-station data, naive stretch got 77% vs. 14% for a physically correct rendering.
- Trained weights (`best.pt`) are probably not in git. Ask Erica where they are; do not guess.

## Rules
1. **Preprocessing parity.** Import preprocessing and rendering from the model repo, pinned to a specific commit. Never copy, rewrite, or "simplify" it. Different preprocessing still returns boxes. They are just wrong, and nothing errors.
2. **Golden test before any deploy.** Run the full pipeline on a human-reviewed Type III window and check the returned UTC start and end times against the reviewed times. A failing golden test blocks the deploy.
3. **Treat uploads as untrusted.** Check the file really parses as FITS (not just the extension), enforce a server-side size cap, cap `.gz` decompression size, and delete temp files after each request.
4. **No real lab data in this public repo.** Sample or synthetic data only, until the PI approves otherwise.
5. Keep the front end plain HTML/CSS/JS unless Erica decides to change that.
6. Recommended backend: one FastAPI app in one Docker container, CPU only.

## Milestones (do in order; each gates the next)
1. Reproduce one detection locally: run `best.pt` on one reviewed Type III window, and confirm the box matches the reviewed times.
2. Write the inference wrapper `detect(fits_path) -> list[Detection]` using the model repo's preprocessing, plus golden and negative pytest tests.
3. Build the FastAPI `/detect` endpoint with validation, and connect `app.js` to it.
4. Containerize (Dockerfile, golden test runs inside the image) and deploy to the host the PI approves.
5. Later (v2): a worker that polls the station Dropbox and runs detection automatically.

## Open questions (don't assume answers; ask Erica)
- What exactly do Marquette students upload, and from which receiver?
- Does "live" mean detect-on-upload (current plan) or continuous Dropbox monitoring?
- Can data be hosted publicly or stored? Is there a server or budget?
- Where are the current weights, and which training run do they come from?
- What timing tolerance should the golden test use?

## How to work with Erica
- She's a CompE sophomore and is learning. **Explain what you're about to change and why before doing it**, and explain the tradeoffs of each design choice. Don't explain basics like loops.
- Prefer showing her how over silently doing it all. Keep each change small enough that she can read and explain every line in an interview.
- When something breaks, explain the cause, not just the fix.
- Ask before large or hard-to-undo changes: new frameworks, restructuring files, changing the backend contract, force-pushing.
- She skims long replies. Lead with a short step-by-step plan, then the details.
- Commit in small, descriptive commits. Use a branch and a pull request for anything Praneel should review.
