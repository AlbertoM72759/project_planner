/*************************
 * Schedule Availability Detector — app.js (Mon–Fri only)
 * Plot-on-demand availability detection + localStorage persistence.
 *
 * NEW:
 * - "Clear All" button wipes saved + current session, resets UI
 * - Each uploaded person has a "Delete" button (removes just that one)
 *************************/

/*************************
 * DOM REFERENCES
 *************************/
const personNameInput = document.getElementById("personName");
const addScheduleButton = document.getElementById("addScheduleButton");
const imageInput = document.getElementById("imageInput");
const startTimeSelect = document.getElementById("startTime");
const doneButton = document.getElementById("doneButton");
const resultsContainer = document.getElementById("resultsContainer");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const queryStart = document.getElementById("queryStart");
const queryEnd = document.getElementById("queryEnd");
const queryButton = document.getElementById("queryButton");
const queryDay = document.getElementById("queryDay");

const uploadStep = document.getElementById("uploadStep");
const queryStep = document.getElementById("queryStep");

const uploadedList = document.getElementById("uploadedList");
const uploadedCount = document.getElementById("uploadedCount");
const toggleListButton = document.getElementById("toggleListButton");

const backButton = document.getElementById("backButton");

// NEW
const clearAllButton = document.getElementById("clearAllButton");

/*************************
 * DATA
 *************************/
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const uploadedSchedules = []; // { name, img, pre, anchorStartTime }

/*************************
 * PERSISTENCE (localStorage)
 *************************/
const STORAGE_KEY = "schedule_detector_saved_v1";

function schedulesToSerializable() {
  return uploadedSchedules.map((p) => ({
    name: p.name,
    anchorStartTime: p.anchorStartTime,
    imageDataURL: p.img?.src || null,
  }));
}

function saveSchedulesToLocalStorage() {
  try {
    const payload = {
      savedAt: Date.now(),
      schedules: schedulesToSerializable(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

function loadSavedPayload() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error(e);
    return null;
  }
}

function clearSavedFromLocalStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function restoreSchedulesFromLocalStorage() {
  const payload = loadSavedPayload();
  if (!payload?.schedules?.length) return false;

  const restored = [];

  for (const item of payload.schedules) {
    if (!item?.imageDataURL || !item?.name || !item?.anchorStartTime) continue;

    const img = new Image();
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = item.imageDataURL;
      });
    } catch (e) {
      console.warn("Failed to restore one image", e);
      continue;
    }

    let pre;
    try {
      pre = preprocessImage(img);
      if (!pre.blackLines || pre.blackLines.length < 2) continue;
    } catch (e) {
      console.warn("Failed to preprocess restored image", e);
      continue;
    }

    restored.push({
      name: item.name,
      img,
      pre,
      anchorStartTime: item.anchorStartTime,
    });
  }

  if (!restored.length) return false;

  uploadedSchedules.length = 0;
  uploadedSchedules.push(...restored);
  renderUploadedList();

  // Jump to query step on restore
  uploadStep.style.display = "none";
  queryStep.style.display = "block";
  window.scrollTo(0, 0);

  return true;
}

/*************************
 * POPULATE TIME DROPDOWNS
 *************************/
function populateTimes(selectEl) {
  selectEl.innerHTML = "";
  let hour = 6;
  let minute = 0;

  while (!(hour === 18 && minute === 0)) {
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    const displayMinute = minute.toString().padStart(2, "0");
    const label = `${displayHour}:${displayMinute} ${ampm}`;

    const opt = document.createElement("option");
    opt.value = label;
    opt.textContent = label;
    selectEl.appendChild(opt);

    minute += 30;
    if (minute === 60) {
      minute = 0;
      hour++;
    }
  }
}
populateTimes(startTimeSelect);
populateTimes(queryStart);
populateTimes(queryEnd);

/*************************
 * IMAGE UPLOAD & PREVIEW
 *************************/
let previewImage = null;
let previewObjectURL = null;
let lastSelectedFile = null;
const MAX_PREVIEW_SIZE = 800;

imageInput.addEventListener("change", () => {
  const file = imageInput.files && imageInput.files[0];
  if (!file) return;

  lastSelectedFile = file;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (previewObjectURL) {
    URL.revokeObjectURL(previewObjectURL);
    previewObjectURL = null;
  }

  previewImage = new Image();

  previewImage.onload = () => {
    const scale = Math.min(
      MAX_PREVIEW_SIZE / previewImage.width,
      MAX_PREVIEW_SIZE / previewImage.height,
      1
    );

    canvas.width = Math.round(previewImage.width * scale);
    canvas.height = Math.round(previewImage.height * scale);

    ctx.drawImage(previewImage, 0, 0, canvas.width, canvas.height);

    if (previewObjectURL) {
      URL.revokeObjectURL(previewObjectURL);
      previewObjectURL = null;
    }
  };

  previewImage.onerror = () => alert("Failed to load image. Try a different file.");

  previewObjectURL = URL.createObjectURL(file);
  previewImage.src = previewObjectURL;
});

/*************************
 * TIME HELPERS
 *************************/
function timeToMinutes(timeStr) {
  const [time, ampm] = timeStr.split(" ");
  let [hour, minute] = time.split(":").map(Number);
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function formatTimeFromMinutes(totalMinutes) {
  let hour = Math.floor(totalMinutes / 60);
  let minute = totalMinutes % 60;
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minute.toString().padStart(2, "0")} ${ampm}`;
}

function generateTimeRange(start, end) {
  const times = [];
  let cur = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  while (cur <= endMin) {
    times.push(formatTimeFromMinutes(cur));
    cur += 30;
  }
  return times;
}

/*************************
 * PIXEL + PREFIX SUM HELPERS
 *************************/
function idxOf(x, y, w) {
  return (y * w + x) * 4;
}

function isNearWhite(r, g, b, thresh = 240) {
  return r >= thresh && g >= thresh && b >= thresh;
}

function isDark(r, g, b, lumThresh = 140) {
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum <= lumThresh;
}

function buildMasksAndPrefixes(imgData, w, h) {
  const whiteMask = new Uint8Array(w * h);
  const darkMask = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    const rowBase = y * w;
    for (let x = 0; x < w; x++) {
      const i = idxOf(x, y, w);
      const r = imgData[i],
        g = imgData[i + 1],
        b = imgData[i + 2];

      whiteMask[rowBase + x] = isNearWhite(r, g, b) ? 1 : 0;
      darkMask[rowBase + x] = isDark(r, g, b) ? 1 : 0;
    }
  }

  const W = w + 1;
  const H = h + 1;
  const whiteP = new Int32Array(W * H);
  const darkP = new Int32Array(W * H);

  for (let y = 1; y < H; y++) {
    let rowWhite = 0;
    let rowDark = 0;
    const maskRow = (y - 1) * w;
    for (let x = 1; x < W; x++) {
      rowWhite += whiteMask[maskRow + (x - 1)];
      rowDark += darkMask[maskRow + (x - 1)];

      const p = y * W + x;
      whiteP[p] = whiteP[(y - 1) * W + x] + rowWhite;
      darkP[p] = darkP[(y - 1) * W + x] + rowDark;
    }
  }

  return { whiteP, darkP, W };
}

function rectSum(prefix, W, x0, y0, x1, y1) {
  const A = y0 * W + x0;
  const B = y0 * W + x1;
  const C = y1 * W + x0;
  const D = y1 * W + x1;
  return prefix[D] - prefix[B] - prefix[C] + prefix[A];
}

/*************************
 * HORIZONTAL TIME-LINE DETECTION
 *************************/
function findBlackLinesFast(darkP, W, w, h) {
  const x0 = Math.floor(w * 0.07);
  const x1 = Math.floor(w * 0.14);

  const candidates = [];
  const bandH = 2;

  const yStart = Math.floor(h * 0.08);
  const yEnd = Math.floor(h * 0.98);

  for (let y = yStart; y < yEnd; y += 1) {
    const score = rectSum(darkP, W, x0, y, x1, Math.min(h, y + bandH));
    candidates.push({ y, score });
  }

  const minScore = Math.floor((x1 - x0) * 0.35);

  const peaks = [];
  for (let i = 2; i < candidates.length - 2; i++) {
    const a = candidates[i - 1], b = candidates[i], c = candidates[i + 1];
    if (b.score >= minScore && b.score >= a.score && b.score >= c.score) {
      peaks.push(b);
    }
  }

  if (peaks.length < 2) return [];

  const MIN_GAP = 24;
  const MAX_GAP = 45;

  const dp = new Array(peaks.length).fill(0);
  const prev = new Array(peaks.length).fill(-1);

  for (let i = 0; i < peaks.length; i++) {
    dp[i] = peaks[i].score;
    for (let j = 0; j < i; j++) {
      const gap = peaks[i].y - peaks[j].y;
      if (gap >= MIN_GAP && gap <= MAX_GAP) {
        const cand = dp[j] + peaks[i].score;
        if (cand > dp[i]) {
          dp[i] = cand;
          prev[i] = j;
        }
      }
    }
  }

  let bestIdx = 0;
  for (let i = 1; i < dp.length; i++) {
    if (dp[i] > dp[bestIdx]) bestIdx = i;
  }

  const chain = [];
  while (bestIdx !== -1) {
    chain.push(peaks[bestIdx].y);
    bestIdx = prev[bestIdx];
  }
  chain.reverse();

  const lines = [];
  for (const y of chain) {
    if (!lines.length || Math.abs(y - lines[lines.length - 1]) > 6) {
      lines.push(y);
    }
  }

  return lines;
}

/*************************
 * MAP REQUESTED TIME → y-band
 *************************/
function getBandForTime(pre, anchorStartTime, timeStr) {
  const startMin = timeToMinutes(anchorStartTime);
  const tMin = timeToMinutes(timeStr);

  const delta = tMin - startMin;
  if (delta < 0) return null;
  if (delta % 30 !== 0) return null;

  const k = delta / 30;
  const lines = pre.blackLines;

  if (!lines || lines.length < 2) return null;
  if (k < 0 || k + 1 >= lines.length) return null;

  return { yStart: lines[k], yEnd: lines[k + 1], slotIndex: k };
}

/*************************
 * DAY REGIONS AT BAND
 *************************/
function getDayRegionsAtBand(pre, yStart, yEnd) {
  const { darkP, W, w } = pre;

  const bandH = Math.max(1, yEnd - yStart);
  const threshold = Math.floor(bandH * 0.60);

  const dividers = [];
  let inRun = false;
  let runStart = 0;

  for (let x = 0; x < w; x++) {
    const darkCount = rectSum(darkP, W, x, yStart, x + 1, yEnd);
    const isDivider = darkCount >= threshold;

    if (isDivider && !inRun) {
      inRun = true;
      runStart = x;
    } else if (!isDivider && inRun) {
      inRun = false;
      const runEnd = x - 1;
      dividers.push(Math.floor((runStart + runEnd) / 2));
    }
  }
  if (inRun) {
    const runEnd = w - 1;
    dividers.push(Math.floor((runStart + runEnd) / 2));
  }

  const bounds = [0, ...dividers, w - 1].sort((a, b) => a - b);

  const segments = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i];
    const b = bounds[i + 1];
    const width = b - a;
    if (width >= 20) segments.push({ a, b, width });
  }

  if (segments.length < 5) return null;

  segments.sort((p, q) => q.width - p.width);
  const top5 = segments.slice(0, 5).sort((p, q) => p.a - q.a);

  const margin = 10;
  const regions = {};
  for (let i = 0; i < 5; i++) {
    regions[WEEKDAYS[i]] = {
      xStart: top5[i].a + margin,
      xEnd: top5[i].b - margin,
    };
  }
  return regions;
}

/*************************
 * CLASSIFY SLOT BY WHITE RATIO
 *************************/
function isSlotFreeByRatio(pre, x0, x1, y0, y1, whiteRatioThresh = 0.90) {
  const { whiteP, W } = pre;

  const padX = 10;
  const padTop = 6;
  const padBottom = 6;

  const sx0 = Math.min(x1 - 1, x0 + padX);
  const sx1 = Math.max(sx0 + 1, x1 - padX);

  const bandH = Math.max(1, y1 - y0);
  const textAvoid = Math.floor(bandH * 0.25);

  const sy0 = Math.min(y1 - 1, y0 + padTop + textAvoid);
  const sy1 = Math.max(sy0 + 1, y1 - padBottom);

  const area = (sx1 - sx0) * (sy1 - sy0);
  if (area <= 0) return false;

  const whiteCount = rectSum(whiteP, W, sx0, sy0, sx1, sy1);
  return whiteCount / area >= whiteRatioThresh;
}

/*************************
 * PREPROCESS IMAGE
 *************************/
function preprocessImage(img) {
  const offCanvas = document.createElement("canvas");
  const offCtx = offCanvas.getContext("2d", { willReadFrequently: true });

  offCanvas.width = img.width;
  offCanvas.height = img.height;
  offCtx.drawImage(img, 0, 0);

  const w = img.width;
  const h = img.height;

  const imgData = offCtx.getImageData(0, 0, w, h).data;
  const { whiteP, darkP, W } = buildMasksAndPrefixes(imgData, w, h);
  const blackLines = findBlackLinesFast(darkP, W, w, h);

  return { whiteP, darkP, W, blackLines, w, h };
}

/*************************
 * QUERY ONE PERSON
 *************************/
function computePersonBreakdown(person, day, startTimeStr, endTimeStr) {
  const times = generateTimeRange(startTimeStr, endTimeStr);
  const breakdown = {};
  let fullyFree = true;
  let coversRange = true;

  const firstBand = getBandForTime(person.pre, person.anchorStartTime, times[0]);
  if (!firstBand) {
    times.forEach(t => (breakdown[t] = false));
    return { breakdown, fullyFree: false, coversRange: false, meta: buildMeta(person) };
  }

  const dayRegions = getDayRegionsAtBand(person.pre, firstBand.yStart, firstBand.yEnd);
  if (!dayRegions || !dayRegions[day]) {
    times.forEach(t => (breakdown[t] = false));
    return { breakdown, fullyFree: false, coversRange: false, meta: buildMeta(person) };
  }

  const region = dayRegions[day];

  for (const t of times) {
    const band = getBandForTime(person.pre, person.anchorStartTime, t);
    if (!band) {
      coversRange = false;
      breakdown[t] = false;
      fullyFree = false;
      continue;
    }

    const free = isSlotFreeByRatio(person.pre, region.xStart, region.xEnd, band.yStart, band.yEnd, 0.90);
    breakdown[t] = free;
    if (!free) fullyFree = false;
  }

  return { breakdown, fullyFree, coversRange, meta: buildMeta(person) };
}

function buildMeta(person) {
  const slots = person.pre.blackLines ? Math.max(0, person.pre.blackLines.length - 1) : 0;
  const startMin = timeToMinutes(person.anchorStartTime);
  const lastMappedMin = startMin + Math.max(0, slots - 1) * 30;
  return {
    lastMappedTime: slots > 0 ? formatTimeFromMinutes(lastMappedMin) : null,
    slotsDetected: slots,
    anchorStartTime: person.anchorStartTime,
  };
}

/*************************
 * RENDER RESULTS
 *************************/
function renderResults(results) {
  resultsContainer.innerHTML = "";

  results.forEach((person) => {
    const trueTimes = Object.entries(person.breakdown)
      .filter(([_, free]) => free)
      .map(([time]) => time);

    if (trueTimes.length === 0) return;

    const div = document.createElement("div");
    div.className = "result-person";

    const header = document.createElement("h3");
    header.textContent = person.name.toUpperCase() + ":";
    div.appendChild(header);

    if (!person.coversRange) {
      const warn = document.createElement("div");
      warn.textContent =
        "⚠️ This schedule image does not cover the full requested time range. Later times may be unreliable.";
      warn.style.color = "#ffcc00";
      warn.style.marginBottom = "6px";
      div.appendChild(warn);

      if (person.meta?.lastMappedTime) {
        const small = document.createElement("div");
        small.textContent = `Last mapped time: ${person.meta.lastMappedTime}`;
        small.style.fontSize = "12px";
        small.style.opacity = "0.85";
        div.appendChild(small);
      }
    }

    trueTimes.forEach((time) => {
      const row = document.createElement("div");
      row.textContent = `${time}: TRUE`;
      row.style.color = "green";
      div.appendChild(row);
    });

    resultsContainer.appendChild(div);
  });

  if (!resultsContainer.children.length) {
    resultsContainer.textContent = "No available times found for anyone in that range.";
  }
}

/*************************
 * SIDEBAR LIST + DELETE BUTTONS
 *************************/
function deleteScheduleAtIndex(idx) {
  if (idx < 0 || idx >= uploadedSchedules.length) return;

  const name = uploadedSchedules[idx]?.name || "this person";
  const ok = confirm(`Delete "${name}" from the list?`);
  if (!ok) return;

  uploadedSchedules.splice(idx, 1);
  renderUploadedList();

  // Keep saved state in sync
  if (uploadedSchedules.length) {
    saveSchedulesToLocalStorage();
  } else {
    clearSavedFromLocalStorage();
  }
}

function renderUploadedList() {
  uploadedCount.textContent = `Uploaded: ${uploadedSchedules.length}`;
  uploadedList.innerHTML = "";

  uploadedSchedules.forEach((p, i) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.marginBottom = "6px";

    const label = document.createElement("div");
    label.textContent = `${i + 1}. ${p.name}`;
    label.style.flex = "1";

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "Delete";
    del.style.padding = "4px 8px";
    del.addEventListener("click", () => deleteScheduleAtIndex(i));

    row.appendChild(label);
    row.appendChild(del);
    uploadedList.appendChild(row);
  });
}

/*************************
 * DONE BUTTON (SAVE + CONTINUE)
 *************************/
doneButton.addEventListener("click", () => {
  if (!uploadedSchedules.length) {
    alert("Please add at least one schedule before saving.");
    return;
  }

  const ok = saveSchedulesToLocalStorage();
  if (!ok) {
    alert("Could not save. Your browser storage may be full or blocked.");
    return;
  }

  uploadStep.style.display = "none";
  queryStep.style.display = "block";
  window.scrollTo(0, 0);
});

/*************************
 * BACK (Query Step)
 *************************/
backButton.addEventListener("click", () => {
  queryStep.style.display = "none";
  uploadStep.style.display = "block";
  window.scrollTo(0, 0);
});

/*************************
 * CLEAR ALL (Wipe saved + session)
 *************************/
clearAllButton.addEventListener("click", () => {
  const ok = confirm("Clear EVERYTHING? This will delete all saved schedules and reset the current session.");
  if (!ok) return;

  // wipe saved
  clearSavedFromLocalStorage();

  // wipe session
  uploadedSchedules.length = 0;

  // wipe UI
  renderUploadedList();
  resultsContainer.innerHTML = "";
  queryDay.value = "";
  queryStart.selectedIndex = 0;
  queryEnd.selectedIndex = 0;

  // reset upload fields + preview
  imageInput.value = "";
  personNameInput.value = "";
  startTimeSelect.selectedIndex = 0;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  previewImage = null;
  lastSelectedFile = null;

  if (previewObjectURL) {
    URL.revokeObjectURL(previewObjectURL);
    previewObjectURL = null;
  }

  // go back to upload screen
  queryStep.style.display = "none";
  uploadStep.style.display = "block";
  window.scrollTo(0, 0);
});

/*************************
 * QUERY BUTTON
 *************************/
queryButton.addEventListener("click", () => {
  if (!queryDay.value || !queryStart.value || !queryEnd.value) {
    alert("Please select a day and both start and end times.");
    return;
  }

  if (!WEEKDAYS.includes(queryDay.value)) {
    alert("Please select a weekday (Monday–Friday).");
    return;
  }

  if (timeToMinutes(queryStart.value) > timeToMinutes(queryEnd.value)) {
    alert("Start time must be before end time.");
    return;
  }

  try {
    const results = uploadedSchedules.map((p) => {
      const out = computePersonBreakdown(p, queryDay.value, queryStart.value, queryEnd.value);
      return {
        name: p.name,
        breakdown: out.breakdown,
        fullyFree: out.fullyFree,
        coversRange: out.coversRange,
        meta: out.meta,
      };
    });

    renderResults(results);
  } catch (err) {
    console.error(err);
    alert("An error occurred while checking availability. See console.");
  }
});

/*************************
 * ADD SCHEDULE BUTTON
 *************************/
addScheduleButton.addEventListener("click", async () => {
  if (!previewImage) {
    alert("Please select an image first.");
    return;
  }

  const name = personNameInput.value.trim();
  if (!name) {
    alert("Please enter a name.");
    return;
  }

  if (!startTimeSelect.value) {
    alert("Please select a start time.");
    return;
  }

  if (!lastSelectedFile) {
    alert("Missing selected file. Please re-select the image.");
    return;
  }

  let dataURL;
  try {
    dataURL = await fileToDataURL(lastSelectedFile);
  } catch (e) {
    console.error(e);
    alert("Failed to read image file. Try again.");
    return;
  }

  const persistentImg = new Image();
  try {
    await new Promise((resolve, reject) => {
      persistentImg.onload = resolve;
      persistentImg.onerror = reject;
      persistentImg.src = dataURL;
    });
  } catch (e) {
    console.error(e);
    alert("Failed to load image. Try a different file.");
    return;
  }

  let pre;
  try {
    pre = preprocessImage(persistentImg);
    if (!pre.blackLines || pre.blackLines.length < 2) {
      alert("Could not detect enough horizontal time lines. Try a clearer screenshot.");
      return;
    }
  } catch (e) {
    console.error(e);
    alert("Failed to analyze image. Try a different file.");
    return;
  }

  uploadedSchedules.push({
    name,
    img: persistentImg,
    pre,
    anchorStartTime: startTimeSelect.value,
  });

  renderUploadedList();

  // reset inputs
  imageInput.value = "";
  personNameInput.value = "";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  previewImage = null;
  lastSelectedFile = null;

  if (previewObjectURL) {
    URL.revokeObjectURL(previewObjectURL);
    previewObjectURL = null;
  }
});

/*************************
 * TOGGLE SHOW/HIDE UPLOADED LIST
 *************************/
toggleListButton.addEventListener("click", () => {
  const isHidden = uploadedList.style.display === "none";
  uploadedList.style.display = isHidden ? "block" : "none";
  toggleListButton.textContent = isHidden ? "Hide" : "Show";
});

/*************************
 * RESTORE ON PAGE LOAD
 *************************/
window.addEventListener("DOMContentLoaded", async () => {
  await restoreSchedulesFromLocalStorage();
});
