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
const querySection = document.getElementById("querySection");
const queryDay = document.getElementById("queryDay");
const uploadStep = document.getElementById("uploadStep");
const queryStep = document.getElementById("queryStep");
const uploadedList = document.getElementById("uploadedList");
const uploadedCount = document.getElementById("uploadedCount");
const toggleListButton = document.getElementById("toggleListButton");


const uploadedSchedules = [];

/*************************
 * DAY REGIONS (pixel columns)
 *************************/
/*************************
 * DAY REGIONS (dynamic columns, Mon–Fri only)
 *************************/
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/**
 * Computes pixel column ranges for Monday–Friday based on the image width.
 * This avoids hardcoding 840px and works for any screenshot size.
 */
function getDayRegionsForImage(imageWidth) {
  const regions = {};
  const colWidth = imageWidth / 5;

  WEEKDAYS.forEach((day, i) => {
    const xStart = Math.floor(i * colWidth);
    const xEnd = Math.floor((i + 1) * colWidth);
    regions[day] = { xStart, xEnd };
  });

  return regions;
}


/*************************
 * POPULATE TIME DROPDOWNS
 *************************/
function populateTimes(selectElement) {
  let hour = 6;
  let minute = 0;

  while (!(hour === 18 && minute === 0)) {
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    const displayMinute = minute.toString().padStart(2, "0");
    const label = `${displayHour}:${displayMinute} ${ampm}`;

    const option = document.createElement("option");
    option.value = label;
    option.textContent = label;
    selectElement.appendChild(option);

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
const MAX_PREVIEW_SIZE = 800; // max width or height

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (!file) return;

  // Clear canvas before loading
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Create new Image object
  previewImage = new Image();

  // When image fully loads
  previewImage.onload = () => {
    // Calculate scaling to fit preview
    const scale = Math.min(MAX_PREVIEW_SIZE / previewImage.width, MAX_PREVIEW_SIZE / previewImage.height, 1);

    canvas.width = previewImage.width * scale;
    canvas.height = previewImage.height * scale;

    // Draw scaled image onto canvas
    ctx.drawImage(previewImage, 0, 0, canvas.width, canvas.height);

    console.log("Preview loaded:", file.name, "Canvas size:", canvas.width, "x", canvas.height);
  };

  // Error handling
  previewImage.onerror = () => {
    alert("Failed to load image. Try a different file.");
  };

  // Trigger loading
  previewImage.src = URL.createObjectURL(file);
});

/*************************
 * TIME HELPERS
 *************************/
function parseStartTime(timeStr) {
  const [time, ampm] = timeStr.split(" ");
  let [hour, minute] = time.split(":").map(Number);
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  return { hour, minute };
}

function formatTime(hour, minute) {
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minute.toString().padStart(2, "0")} ${ampm}`;
}

function timeToMinutes(timeStr) {
  const [time, ampm] = timeStr.split(" ");
  let [hour, minute] = time.split(":").map(Number);
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function generateTimeRange(start, end) {
  const times = [];
  let current = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  while (current <= endMin) {
    times.push(formatTime(Math.floor(current / 60), current % 60));
    current += 30;
  }
  return times;
}

/*************************
 * OFFSCREEN SLOT CHECK
 *************************/
function isSlotFree(ctxToUse, xStart, xEnd, yStart, yEnd) {
  for (let y = yStart + 2; y < yEnd - 2; y++) {
    for (let x = xStart + 2; x < xEnd - 2; x += 5) {
      const [r, g, b] = ctxToUse.getImageData(x, y, 1, 1).data;
      if (!(r > 240 && g > 240 && b > 240)) return false;
    }
  }
  return true;
}

function findBlackLines(ctxToUse, width, height) {
  const lines = [];
  const imgData = ctxToUse.getImageData(0, 0, width, height);

  for (let y = 0; y < height; y++) {
    let blackCount = 0;
    for (let x = 0; x < width; x += 5) {
      const idx = (y * width + x) * 4;
      const r = imgData.data[idx];
      const g = imgData.data[idx + 1];
      const b = imgData.data[idx + 2];
      if (r < 40 && g < 40 && b < 40) blackCount++;
    }
    if (blackCount > width / 20) {
      lines.push(y);
      y += 6;
    }
  }
  return lines;
}

/*************************
 * PROCESS IMAGE (OFFSCREEN)
 *************************/
function processImageForAvailability(img) {
  const offCanvas = document.createElement("canvas");
  const offCtx = offCanvas.getContext("2d");
  offCanvas.width = img.width;
  offCanvas.height = img.height;
  offCtx.drawImage(img, 0, 0);

  const blackLines = findBlackLines(offCtx, img.width, img.height);
  const start = parseStartTime(startTimeSelect.value);

  const dayRegions = getDayRegionsForImage(img.width);

  const availability = {};
  WEEKDAYS.forEach(day => (availability[day] = {}));


  let hour = start.hour;
  let minute = start.minute;

  for (let i = 0; i < blackLines.length - 1; i++) {
    const yStart = blackLines[i];
    const yEnd = blackLines[i + 1];

    Object.entries(dayRegions).forEach(([day, region]) => {
        availability[day][formatTime(hour, minute)] = isSlotFree(
        offCtx,
        region.xStart,
        region.xEnd,
        yStart,
        yEnd
        );
    });


    minute += 30;
    if (minute === 60) {
      minute = 0;
      hour++;
    }
  }

  return availability;
}

/*************************
 * DETAILED PER PERSON
 *************************/
function detailedAvailability(data, day, start, end) {
  const range = generateTimeRange(start, end);
  return data.map(person => {
    const breakdown = {};
    let fullyFree = true;

    range.forEach(time => {
      const free = !!person.availability[day][time];
      breakdown[time] = free;
      if (!free) fullyFree = false;
    });

    return { name: person.name, fullyFree, breakdown };
  });
}

/*************************
 * RENDER RESULTS
 *************************/
function renderResults(results) {
  resultsContainer.innerHTML = "";

  results.forEach(person => {
    // keep only TRUE times
    const trueTimes = Object.entries(person.breakdown)
      .filter(([_, free]) => free)
      .map(([time]) => time);

    // if they have zero TRUE slots, don't show them at all
    if (trueTimes.length === 0) return;

    const div = document.createElement("div");
    div.className = "result-person";

    const header = document.createElement("h3");
    header.textContent = person.name.toUpperCase() + ":";
    div.appendChild(header);

    trueTimes.forEach(time => {
      const row = document.createElement("div");
      row.textContent = `${time}: TRUE`;
      row.style.color = "green";
      div.appendChild(row);
    });

    resultsContainer.appendChild(div);
  });

  // If nobody had any TRUE times
  if (!resultsContainer.children.length) {
    resultsContainer.textContent = "No available times found for anyone in that range.";
  }
}

/*************************
 * RENDER LIST OF NAMES
 *************************/
function renderUploadedList() {
  uploadedCount.textContent = `Uploaded: ${uploadedSchedules.length}`;
  uploadedList.innerHTML = "";

  uploadedSchedules.forEach((p, i) => {
    const row = document.createElement("div");
    row.textContent = `${i + 1}. ${p.name}`;
    uploadedList.appendChild(row);
  });
}

/*************************
 * DONE BUTTON
 *************************/
doneButton.addEventListener("click", () => {
  if (!uploadedSchedules.length) {
    alert("Please add at least one schedule before clicking Done.");
    return;
  }

  uploadStep.style.display = "none";
  queryStep.style.display = "block";
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

  if (timeToMinutes(queryStart.value) > timeToMinutes(queryEnd.value)) {
    alert("Start time must be before end time.");
    return;
  }

  const processed = uploadedSchedules.map(p => ({
    name: p.name,
    availability: processImageForAvailability(p.img)
  }));

  const detailed = detailedAvailability(
    processed,
    queryDay.value,
    queryStart.value,
    queryEnd.value
  );

  renderResults(detailed);
});

/*************************
 * ADD SCHEDULE BUTTON
 *************************/
addScheduleButton.addEventListener("click", () => {
  if (!previewImage) {
    alert("Please select an image first.");
    return;
  }

  if (!personNameInput.value.trim()) {
    alert("Please enter a name.");
    return;
  }

  if (!startTimeSelect.value) {
    alert("Please select a start time.");
    return;
  }

//   if (!WEEKDAYS.includes(queryDay.value)) {
//   alert("Please select a weekday (Monday–Friday).");
//   return;
// }

  uploadedSchedules.push({
  name: personNameInput.value.trim(),
  img: previewImage // keep reference intact
});

renderUploadedList(); // <-- ADD THIS

// Reset inputs but DO NOT null previewImage
imageInput.value = "";
personNameInput.value = "";
ctx.clearRect(0, 0, canvas.width, canvas.height);
previewImage = null;
});

/*************************
 * TOGGLE SHOW/HIDE
 *************************/
toggleListButton.addEventListener("click", () => {
  const isHidden = uploadedList.style.display === "none";
  uploadedList.style.display = isHidden ? "block" : "none";
  toggleListButton.textContent = isHidden ? "Hide" : "Show";
});
