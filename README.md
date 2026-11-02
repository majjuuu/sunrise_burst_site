# SunRISE Burst Detector (website)

Front-end demo for the SunRISE solar radio burst detection website. Marquette students will upload e-Callisto FIT files here and see where the YOLOv8 model found bursts.

**Current state: demo mode.** The page shows a synthetic sample spectrogram and sample detections. The model is not connected yet. When the backend exists, set `CONFIG.DETECT_URL` at the top of `app.js` and the page will send uploads there.

## Files

| File | What it holds | Edit it when you want to… |
| --- | --- | --- |
| `index.html` | Page structure and text | Change wording, add a section, add a form field |
| `style.css` | Colors, fonts, spacing, layout | Change how it looks. Colors are at the top as `--tokens` |
| `app.js` | Spectrogram drawing, upload handling, results table | Change behavior, or connect the real model |

No build step and no install. It's plain HTML, CSS, and JavaScript.

## Run it on your computer

Either double-click `index.html`, or run a tiny local server from this folder (better, matches how it runs online):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Make an edit (team workflow)

1. Pull the latest version first: `git pull`
2. Make a branch for your change: `git checkout -b your-name/what-you-changed`
3. Edit, then check it in the browser.
4. Commit and push: `git add . && git commit -m "Describe the change" && git push -u origin HEAD`
5. Open a pull request on GitHub and ask the other person to look at it.
6. Merge it. The live site updates within a minute or two.

Small text fixes can be done right on github.com: open the file, click the pencil icon, edit, and commit. No install needed.

## Connecting the real model (later)

Everything that talks to the model is in one function, `runDetection()` in `app.js`. The backend should return JSON in this shape:

```json
{
  "startUtc": "18:00:00",
  "detections": [
    { "type": "III", "startSec": 218, "endSec": 252, "freqLow": 110, "freqHigh": 790, "confidence": 0.91 }
  ]
}
```

`startSec` and `endSec` are seconds from the start of the 15-minute window. The page converts them to UTC and draws the boxes.

## Owners

Erica Ma and Praneel, SunRISE Software, Detection & Classification.
