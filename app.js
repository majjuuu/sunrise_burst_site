/* SunRISE Burst Detector — front-end demo
 *
 * What this file does:
 *   1. Draws a spectrogram on the <canvas> (a synthetic sample for now).
 *   2. Handles the upload form.
 *   3. Calls runDetection(), which returns a list of detections.
 *   4. Draws a box for each detection and fills the results table.
 *
 * The ONE place to change when the real model is ready is runDetection().
 * Set CONFIG.DETECT_URL to the backend's /detect endpoint and the page will
 * send the uploaded file there instead of returning the sample.
 */

const CONFIG = {
  DETECT_URL: null,               // e.g. "https://<your-host>/detect" once the backend exists
  WINDOW_SECONDS: 15 * 60,        // the model works on fixed 15-minute windows
  FREQ_MIN_MHZ: 45,               // frequency range shown on the plot
  FREQ_MAX_MHZ: 870,
  SAMPLE_START_UTC: "18:00:00",   // start time of the sample window
};

/* ------------------------------------------------------------------
 * Sample detections, written in the same shape the backend will return.
 * Times are seconds from the window start; the page converts them to UTC.
 * These are SYNTHETIC, made up to show the layout. Not real model output.
 * ------------------------------------------------------------------ */
const SAMPLE_DETECTIONS = [
  { type: "III", startSec: 218, endSec: 252, freqLow: 110, freqHigh: 790, confidence: 0.91 },
];

/* ------------------------------------------------------------------
 * Coordinate conversion: the same two functions place the bursts in the
 * picture AND the boxes on top of them, so they can never disagree.
 * (This is the browser-side version of the "map back to UTC" step.)
 * ------------------------------------------------------------------ */
const canvas = document.getElementById("spectrogram");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

function secToX(sec) {
  return (sec / CONFIG.WINDOW_SECONDS) * W;
}
function freqToY(mhz) {
  // low frequency at the bottom, high at the top
  const frac = (mhz - CONFIG.FREQ_MIN_MHZ) / (CONFIG.FREQ_MAX_MHZ - CONFIG.FREQ_MIN_MHZ);
  return H - frac * H;
}
function xToSec(x) { return (x / W) * CONFIG.WINDOW_SECONDS; }
function yToFreq(y) {
  return CONFIG.FREQ_MIN_MHZ + (1 - y / H) * (CONFIG.FREQ_MAX_MHZ - CONFIG.FREQ_MIN_MHZ);
}

/* Converts "seconds from window start" into an HH:MM:SS UTC string. */
function secToUtc(sec, startUtc = CONFIG.SAMPLE_START_UTC) {
  const [h, m, s] = startUtc.split(":").map(Number);
  const total = h * 3600 + m * 60 + s + Math.round(sec);
  const hh = String(Math.floor(total / 3600) % 24).padStart(2, "0");
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/* ------------------------------------------------------------------
 * Synthetic spectrogram drawing.
 * Real spectrograms will come from the backend as images. This only exists
 * so the demo has something realistic to show.
 * ------------------------------------------------------------------ */

// Small seeded random generator so the picture looks the same every load.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Maps an intensity 0..1 to a color, dark blue → purple → orange → yellow,
// similar to the colormaps used for solar radio quick-look plots.
function colormap(v) {
  v = Math.max(0, Math.min(1, v));
  const stops = [
    [0.00, [11, 16, 32]],
    [0.35, [48, 30, 92]],
    [0.60, [150, 48, 110]],
    [0.80, [236, 112, 52]],
    [1.00, [252, 226, 120]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [p0, c0] = stops[i - 1];
      const [p1, c1] = stops[i];
      const t = (v - p0) / (p1 - p0);
      return c0.map((c, k) => Math.round(c + (c1[k] - c) * t));
    }
  }
  return stops[stops.length - 1][1];
}

// Intensity added by bursts at a given time (s) and frequency (MHz).
function burstIntensity(sec, mhz) {
  let v = 0;
  // Type III: fast drift from high to low frequency over a few tens of seconds
  for (const b of [
    { t0: 222, dur: 24, fHi: 780, fLo: 120, amp: 0.75 },
  ]) {
    if (mhz < b.fLo || mhz > b.fHi) continue;
    const arrival = b.t0 + ((b.fHi - mhz) / (b.fHi - b.fLo)) * b.dur;
    const d = sec - arrival;
    v += b.amp * Math.exp(-(d * d) / (2 * 3.5 * 3.5));
  }
  return v;
}

let baseImage = null; // the drawn spectrogram without boxes, reused on every redraw

function drawSpectrogram() {
  const rng = makeRng(20261014);
  const img = ctx.createImageData(W, H);
  const cell = 2; // draw in 2×2 pixel cells, like real time/frequency bins

  // Persistent radio-interference bands, the horizontal lines real data has
  const rfiBands = [96, 101, 162, 430, 433, 610].map((f) => ({ f, amp: 0.25 + rng() * 0.2 }));

  for (let y = 0; y < H; y += cell) {
    const mhz = yToFreq(y);
    let rfi = 0;
    for (const b of rfiBands) {
      if (Math.abs(mhz - b.f) < 2.5) rfi += b.amp;
    }
    const bandGain = 0.12 + 0.06 * Math.sin(mhz / 37); // slow receiver response ripple
    for (let x = 0; x < W; x += cell) {
      const sec = xToSec(x);
      const noise = rng() * 0.16;
      const v = bandGain + noise + rfi + burstIntensity(sec, mhz);
      const [r, g, b] = colormap(v);
      for (let dy = 0; dy < cell; dy++) {
        for (let dx = 0; dx < cell; dx++) {
          const i = ((y + dy) * W + (x + dx)) * 4;
          img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  drawAxes();
  baseImage = ctx.getImageData(0, 0, W, H);
}

// Time ticks every 3 minutes and frequency ticks, drawn inside the plot
function drawAxes() {
  ctx.save();
  ctx.font = "11px 'IBM Plex Mono', monospace";
  ctx.fillStyle = "rgba(230, 236, 245, 0.85)";
  ctx.strokeStyle = "rgba(230, 236, 245, 0.25)";
  for (let sec = 0; sec <= CONFIG.WINDOW_SECONDS; sec += 180) {
    const x = Math.min(secToX(sec), W - 1);
    ctx.beginPath(); ctx.moveTo(x, H - 8); ctx.lineTo(x, H); ctx.stroke();
    const label = secToUtc(sec).slice(0, 5);
    const tx = sec === 0 ? 4 : sec === CONFIG.WINDOW_SECONDS ? W - 38 : x - 17;
    ctx.fillText(label, tx, H - 12);
  }
  for (const mhz of [100, 300, 500, 700]) {
    const y = freqToY(mhz);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(8, y); ctx.stroke();
    ctx.fillText(`${mhz} MHz`, 12, y + 4);
  }
  ctx.restore();
}

function drawDetections(dets) {
  ctx.putImageData(baseImage, 0, 0);
  ctx.save();
  const flare = "#ffb21f";
  dets.forEach((d, i) => {
    const x0 = secToX(d.startSec), x1 = secToX(d.endSec);
    const y0 = freqToY(d.freqHigh), y1 = freqToY(d.freqLow);
    ctx.lineWidth = 2;
    ctx.strokeStyle = flare;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

    // label tag above the box
    const label = `${i + 1} · Type ${d.type} · ${Math.round(d.confidence * 100)}%`;
    ctx.font = "600 11px 'IBM Plex Mono', monospace";
    const tw = ctx.measureText(label).width + 10;
    const tx = Math.min(x0, W - tw - 2);
    const ty = Math.max(y0 - 18, 2);
    ctx.fillStyle = flare;
    ctx.fillRect(tx, ty, tw, 16);
    ctx.fillStyle = "#1a1200";
    ctx.fillText(label, tx + 5, ty + 12);
  });
  ctx.restore();
}

/* ------------------------------------------------------------------
 * Detection call. Replace the demo branch when the backend is ready.
 * Expected backend response (JSON):
 *   { startUtc: "HH:MM:SS", detections: [ { type, startSec, endSec, freqLow, freqHigh, confidence }, ... ] }
 * ------------------------------------------------------------------ */
async function runDetection(file, station, date) {
  if (CONFIG.DETECT_URL && file) {
    const body = new FormData();
    body.append("file", file);
    body.append("station", station);
    body.append("date", date);
    const res = await fetch(CONFIG.DETECT_URL, { method: "POST", body });
    if (!res.ok) throw new Error(`The server returned ${res.status}. Check that the file is a valid FIT file.`);
    return res.json();
  }
  // Demo mode: wait a moment so the scan animation is visible, then return the sample.
  await new Promise((r) => setTimeout(r, 1400));
  return { startUtc: CONFIG.SAMPLE_START_UTC, detections: SAMPLE_DETECTIONS, demo: true };
}

/* ------------------------------------------------------------------
 * Results table, summary, and CSV
 * ------------------------------------------------------------------ */
let currentRows = [];

function renderResults(result) {
  const dets = result.detections;
  drawDetections(dets);

  const tbody = document.getElementById("detections-body");
  tbody.innerHTML = "";
  currentRows = dets.map((d, i) => ({
    n: i + 1,
    type: d.type,
    start: secToUtc(d.startSec, result.startUtc),
    end: secToUtc(d.endSec, result.startUtc),
    freq: `${d.freqLow}–${d.freqHigh}`,
    confidence: d.confidence,
  }));

  if (currentRows.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No bursts found above the confidence threshold in this window.</td></tr>`;
  }
  for (const r of currentRows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.n}</td>
      <td><span class="type-pill">Type ${r.type}</span></td>
      <td class="mono">${r.start}</td>
      <td class="mono">${r.end}</td>
      <td class="mono">${r.freq}</td>
      <td><span class="conf"><span class="conf-bar"><span style="width:${Math.round(r.confidence * 100)}%"></span></span>${Math.round(r.confidence * 100)}%</span></td>`;
    tbody.appendChild(tr);
  }

  document.getElementById("stat-count").textContent = currentRows.length;
  const types = [...new Set(currentRows.map((r) => r.type))];
  document.getElementById("stat-types").textContent = types.length ? types.join(", ") : "—";
}

function rowsToCsv(rows) {
  const header = "number,type,start_utc,end_utc,freq_low_mhz,freq_high_mhz,confidence";
  const lines = rows.map((r) => {
    const [lo, hi] = r.freq.split("–");
    return [r.n, r.type, r.start, r.end, lo, hi, r.confidence.toFixed(2)].join(",");
  });
  return [header, ...lines].join("\n");
}

/* ------------------------------------------------------------------
 * Scan animation: a line sweeps across the plot while "detecting"
 * ------------------------------------------------------------------ */
function startScan() {
  const line = document.getElementById("scanline");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  line.hidden = false;
  const start = performance.now();
  let raf;
  const tick = (now) => {
    const t = ((now - start) / 1400) % 1;
    line.style.left = `${t * 100}%`;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(raf); line.hidden = true; };
}

/* ------------------------------------------------------------------
 * Wiring: upload form, drag-and-drop, buttons
 * ------------------------------------------------------------------ */
const form = document.getElementById("upload-form");
const fileInput = document.getElementById("file-input");
const dropzone = document.getElementById("dropzone");
const note = document.getElementById("form-note");
const runBtn = document.getElementById("run-btn");
const actionNote = document.getElementById("action-note");
let chosenFile = null;

function setFile(file) {
  if (!file) return;
  const ok = /\.(fit|fits|fit\.gz|gz)$/i.test(file.name);
  if (!ok) {
    note.textContent = `"${file.name}" isn't a FIT file. Choose a .fit or .fit.gz file.`;
    return;
  }
  chosenFile = file;
  dropzone.classList.add("has-file");
  document.getElementById("dropzone-main").textContent = file.name;
  document.getElementById("dropzone-sub").textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB · click to change`;
  note.textContent = "Ready. Press Run detection and classification.";
}

fileInput.addEventListener("change", () => setFile(fileInput.files[0]));
["dragenter", "dragover"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add("is-over"); }));
["dragleave", "drop"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove("is-over"); }));
dropzone.addEventListener("drop", (e) => setFile(e.dataTransfer.files[0]));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const station = document.getElementById("station");
  const date = document.getElementById("obs-date").value;
  runBtn.disabled = true;
  runBtn.textContent = "Detecting…";
  note.textContent = "Scanning the window for bursts…";
  ctx.putImageData(baseImage, 0, 0);
  const stopScan = startScan();
  try {
    const result = await runDetection(chosenFile, station.value, date);
    renderResults(result);
    const label = chosenFile ? chosenFile.name : "Sample observation";
    document.getElementById("results-meta").textContent =
      `${label} · ${station.options[station.selectedIndex].text} · ${date} · 18:00–18:15 UTC`;
    note.textContent = result.demo
      ? (chosenFile
          ? "The model isn't connected yet, so this shows the sample result, not your file."
          : "Showing the sample result.")
      : "Done.";
  } catch (err) {
    note.textContent = err.message;
  } finally {
    stopScan();
    runBtn.disabled = false;
    runBtn.textContent = "Run detection and classification";
  }
});

document.getElementById("copy-csv").addEventListener("click", async () => {
  const csv = rowsToCsv(currentRows);
  try {
    await navigator.clipboard.writeText(csv);
    actionNote.textContent = "Copied. Paste it into a spreadsheet.";
  } catch {
    actionNote.textContent = "Copy isn't allowed here. Use Download CSV instead.";
  }
});

document.getElementById("download-csv").addEventListener("click", () => {
  const blob = new Blob([rowsToCsv(currentRows)], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "sunrise_detections.csv";
  a.click();
  URL.revokeObjectURL(a.href);
  actionNote.textContent = "Downloaded sunrise_detections.csv.";
});

/* First load: draw the sample and show its results so the page is never empty. */
drawSpectrogram();
renderResults({ startUtc: CONFIG.SAMPLE_START_UTC, detections: SAMPLE_DETECTIONS, demo: true });
