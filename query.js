// query.js — ONLY runs on query.html
// Wiring-only: no core logic, no constants, no storage schema.
// Assumes app.js provides populateTimes() + queryAllSavedSchedulesDayRange().

(function () {
  function $(id) { return document.getElementById(id); }

  function escapeHTML(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function initTimes() {
    const qs = $("queryStart");
    const qe = $("queryEnd");

    if (typeof window.populateTimes === "function") {
      window.populateTimes(qs);
      window.populateTimes(qe);
    } else {
      console.warn("query.js: populateTimes() missing (expected from app.js)");
    }
  }

  function render(res) {
    const root = $("resultsContainer");
    if (!root) return;

    if (!res?.ok) {
      root.innerHTML = `<div class="warn">Query failed: ${escapeHTML(res?.reason || "unknown")}</div>`;
      return;
    }

    const available = Array.isArray(res.available) ? res.available : [];
    const skipped = Array.isArray(res.skipped) ? res.skipped : [];

    if (!available.length) {
      root.innerHTML = `<div class="muted">No one has free time in that window.</div>`;
      return;
    }

    root.innerHTML = `
      <div class="results-head">
        <div><b>${escapeHTML(res.day)}</b> ${escapeHTML(res.startStr)} → ${escapeHTML(res.endStr)}</div>
        <div class="muted">Listed: ${available.length} • Skipped: ${skipped.length}</div>
      </div>
      ${available.map(p => `
        <div class="result-bubble">
          <div class="result-name">${escapeHTML(p.person)}</div>
          <div class="result-ranges">
            ${(p.freeRanges || []).map(r => `
              <span class="pill">${escapeHTML(r.start)} – ${escapeHTML(r.end)}</span>
            `).join("")}
          </div>
        </div>
      `).join("")}
      ${skipped.length ? `
        <details class="skipped">
          <summary>Skipped (${skipped.length})</summary>
          <ul>
            ${skipped.map(s => `<li><b>${escapeHTML(s.person)}</b>: ${escapeHTML(s.reason)}</li>`).join("")}
          </ul>
        </details>
      ` : ``}
    `;
  }

  function runQuery() {
    const day = $("queryDay")?.value || "Monday";
    const startStr = $("queryStart")?.value || "8:00 AM";
    const endStr = $("queryEnd")?.value || "9:00 AM";

    if (typeof window.queryAllSavedSchedulesDayRange !== "function") {
      render({
        ok: false,
        reason: "Missing core query function (queryAllSavedSchedulesDayRange) in app.js"
      });
      return;
    }

    const res = window.queryAllSavedSchedulesDayRange(day, startStr, endStr);
    render(res);
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTimes();

    const btn = $("queryButton");
    if (btn) btn.addEventListener("click", runQuery);
  });
})();
