import React, { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "eggOracleTrackingFirst.v2";

function Icon({ name, size = 20, className = "" }) {
  const symbols = {
    chart: "▥",
    calendar: "▦",
    settings: "⚙",
    export: "⇩",
    import: "⇧",
    trash: "⌫",
    left: "‹",
    right: "›",
    droplet: "●",
    heart: "♥",
    plus: "+",
    sparkles: "✦",
    note: "▤",
    close: "×",
  };

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center leading-none ${className}`}
      style={{ width: size, height: size, fontSize: size }}
    >
      {symbols[name] || "•"}
    </span>
  );
}

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fromISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function diffDays(a, b) {
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((end - start) / 86400000);
}

function isBetween(date, start, end) {
  return date >= start && date <= end;
}

function sameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function monthTitle(date) {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatDate(date) {
  if (!date) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDateLong(date) {
  if (!date) return "";
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function buildMonthDays(monthDate) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function defaultData() {
  return {
    cycleLengthFallback: 44,
    periodLengthFallback: 5,
    logs: {},
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    return {
      ...defaultData(),
      ...parsed,
      logs: parsed.logs && typeof parsed.logs === "object" ? parsed.logs : {},
    };
  } catch {
    return defaultData();
  }
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Local storage can fail in privacy/sandbox modes. The app should still run.
  }
}

function normalizeImportedData(value) {
  if (!value || typeof value !== "object") throw new Error("Import file is not valid Egg Oracle data.");
  const logs = value.logs && typeof value.logs === "object" ? value.logs : {};
  const cleanedLogs = {};

  Object.entries(logs).forEach(([iso, log]) => {
    if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(iso)) cleanedLogs[iso] = cleanLog(log);
  });

  return {
    cycleLengthFallback: clampNumber(value.cycleLengthFallback, 44, 15, 60),
    periodLengthFallback: clampNumber(value.periodLengthFallback, 5, 1, 14),
    logs: cleanedLogs,
  };
}

function makeExportPayload(data) {
  return {
    app: "Egg Oracle",
    version: 2,
    exportedAt: new Date().toISOString(),
    data: normalizeImportedData(data),
  };
}

function cleanLog(log = {}) {
  return {
    periodStart: !!log.periodStart,
    periodEnd: !!log.periodEnd,
    periodFlow: log.periodFlow || "none",
    spotting: !!log.spotting,
    cervicalMucus: log.cervicalMucus || "",
    intercourse: !!log.intercourse,
    opk: log.opk || "",
    notes: log.notes || "",
  };
}

function getPeriodStartDates(data) {
  return Object.entries(data.logs || {})
    .filter(([, log]) => log?.periodStart)
    .map(([iso]) => iso)
    .sort();
}

function getPeriodEndDates(data) {
  return Object.entries(data.logs || {})
    .filter(([, log]) => log?.periodEnd)
    .map(([iso]) => iso)
    .sort();
}

function getPeriodEndForStart(data, startISO, nextStartISO) {
  const start = fromISO(startISO);
  const nextStart = nextStartISO ? fromISO(nextStartISO) : addDays(start, 21);
  const explicitEnds = getPeriodEndDates(data)
    .map(fromISO)
    .filter((end) => end >= start && end < nextStart)
    .sort((a, b) => a - b);

  if (explicitEnds.length) return explicitEnds[0];

  let lastFlowDay = null;
  for (let d = new Date(start); d < nextStart; d = addDays(d, 1)) {
    const log = data.logs[toISO(d)];
    if (log?.periodFlow && log.periodFlow !== "none") lastFlowDay = new Date(d);
    else if (lastFlowDay) break;
  }

  return lastFlowDay;
}

function getPeriodDays(data) {
  return Object.entries(data.logs || {})
    .filter(([, log]) => log?.periodFlow && log.periodFlow !== "none")
    .map(([iso]) => iso)
    .sort();
}

function getCycleLengths(periodStarts) {
  const lengths = [];
  for (let i = 1; i < periodStarts.length; i++) {
    const length = diffDays(fromISO(periodStarts[i - 1]), fromISO(periodStarts[i]));
    if (length >= 15 && length <= 60) lengths.push(length);
  }
  return lengths;
}

function avg(nums, fallback = 0) {
  if (!nums.length) return fallback;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function median(nums) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function getCycleStats(data) {
  const periodStarts = getPeriodStartDates(data);
  const periodEnds = getPeriodEndDates(data);
  const cycleLengths = getCycleLengths(periodStarts);
  const fallbackCycle = clampNumber(data.cycleLengthFallback, 44, 15, 60);
  const fallbackPeriod = clampNumber(data.periodLengthFallback, 5, 1, 14);
  const averageCycleLength = avg(cycleLengths, fallbackCycle);

  const periodLengths = periodStarts.map((startISO, index) => {
    const nextStartISO = periodStarts[index + 1];
    const end = getPeriodEndForStart(data, startISO, nextStartISO);
    if (end) return Math.max(1, diffDays(fromISO(startISO), end) + 1);
    return fallbackPeriod;
  });

  const averagePeriodLength = avg(periodLengths, fallbackPeriod);
  const logs = Object.values(data.logs || {});

  return {
    periodStarts,
    periodEnds,
    cycleLengths,
    periodLengths,
    averageCycleLength,
    shortestCycle: cycleLengths.length ? Math.min(...cycleLengths) : 0,
    longestCycle: cycleLengths.length ? Math.max(...cycleLengths) : 0,
    medianCycle: median(cycleLengths),
    averagePeriodLength,
    shortestPeriod: periodLengths.length ? Math.min(...periodLengths) : 0,
    longestPeriod: periodLengths.length ? Math.max(...periodLengths) : 0,
    periodDayCount: getPeriodDays(data).length,
    loggedDays: Object.keys(data.logs || {}).filter((iso) => Object.values(data.logs[iso] || {}).some(Boolean)).length,
    intercourseDays: logs.filter((log) => log.intercourse).length,
    spottingDays: logs.filter((log) => log.spotting).length,
    fertileMucusDays: logs.filter((log) => ["watery", "egg-white"].includes(log.cervicalMucus)).length,
    positiveOPKDays: logs.filter((log) => ["positive", "peak"].includes(log.opk)).length,
  };
}

function getOPKAdjustedOvulation(data, calendarOvulationDate, cycleStart, nextStart) {
  const opkEntries = Object.entries(data.logs || {})
    .map(([iso, log]) => ({ iso, date: fromISO(iso), opk: log?.opk || "" }))
    .filter((entry) => entry.date >= cycleStart && entry.date < nextStart && ["positive", "peak"].includes(entry.opk))
    .sort((a, b) => a.date - b.date);

  if (!opkEntries.length) {
    return { ovulationDate: calendarOvulationDate, source: "calendar", opkDate: null };
  }

  const strongest = opkEntries.find((entry) => entry.opk === "peak") || opkEntries[opkEntries.length - 1];
  return {
    ovulationDate: addDays(strongest.date, 1),
    source: strongest.opk,
    opkDate: strongest.date,
  };
}

function getMucusAdjustedFertileStart(data, baseFertileStart, cycleStart, ovulationDate) {
  const fertileMucusEntries = Object.entries(data.logs || {})
    .map(([iso, log]) => ({ iso, date: fromISO(iso), mucus: log?.cervicalMucus || "" }))
    .filter((entry) => entry.date >= cycleStart && entry.date <= ovulationDate && ["watery", "egg-white"].includes(entry.mucus))
    .sort((a, b) => a.date - b.date);

  if (!fertileMucusEntries.length) {
    return { fertileStart: baseFertileStart, mucusDate: null, source: "ovulation" };
  }

  const earliestMucus = fertileMucusEntries[0].date;
  if (earliestMucus < baseFertileStart) {
    return { fertileStart: earliestMucus, mucusDate: earliestMucus, source: "mucus" };
  }

  return { fertileStart: baseFertileStart, mucusDate: earliestMucus, source: "ovulation" };
}

function findCycleForDate(data, date) {
  const stats = getCycleStats(data);
  const starts = stats.periodStarts;
  let currentStartISO = starts.filter((iso) => fromISO(iso) <= date).at(-1);

  if (!currentStartISO) {
    const anchor = starts[0] ? fromISO(starts[0]) : new Date(date.getFullYear(), date.getMonth(), date.getDate());
    while (anchor > date) anchor.setDate(anchor.getDate() - stats.averageCycleLength);
    currentStartISO = toISO(anchor);
  }

  const currentStart = fromISO(currentStartISO);
  const nextKnownStartISO = starts.find((iso) => fromISO(iso) > currentStart);
  const nextStart = nextKnownStartISO ? fromISO(nextKnownStartISO) : addDays(currentStart, stats.averageCycleLength);
  const cycleDay = diffDays(currentStart, date) + 1;
  const calendarOvulationDate = addDays(nextStart, -14);
  const adjusted = getOPKAdjustedOvulation(data, calendarOvulationDate, currentStart, nextStart);
  const ovulationDate = adjusted.ovulationDate;
  const ovulationSource = adjusted.source;
  const opkDate = adjusted.opkDate;
  const baseFertileStart = addDays(ovulationDate, -5);
  const mucusAdjusted = getMucusAdjustedFertileStart(data, baseFertileStart, currentStart, ovulationDate);
  const fertileStart = mucusAdjusted.fertileStart;
  const fertileStartSource = mucusAdjusted.source;
  const fertileMucusStartDate = mucusAdjusted.mucusDate;
  const fertileEnd = ovulationDate;
  const actualCurrentEnd = getPeriodEndForStart(data, toISO(currentStart), nextKnownStartISO);
  const periodEnd = actualCurrentEnd || addDays(currentStart, stats.averagePeriodLength - 1);
  const nextPeriodEnd = addDays(nextStart, stats.averagePeriodLength - 1);

  return {
    ...stats,
    currentStart,
    nextStart,
    cycleDay,
    calendarOvulationDate,
    ovulationDate,
    ovulationSource,
    opkDate,
    fertileStart,
    fertileStartSource,
    fertileMucusStartDate,
    fertileEnd,
    periodEnd,
    nextPeriodEnd,
  };
}

function getDayInfo(data, date) {
  const iso = toISO(date);
  const log = cleanLog(data.logs[iso]);
  const cycle = findCycleForDate(data, date);
  const explicitPeriodFlow = !!log.periodFlow && log.periodFlow !== "none";
  const knownPeriod = cycle.periodStarts.includes(toISO(cycle.currentStart)) && isBetween(date, cycle.currentStart, cycle.periodEnd);
  const actualPeriod = explicitPeriodFlow || knownPeriod;
  const predictedPeriod = !actualPeriod && isBetween(date, cycle.nextStart, cycle.nextPeriodEnd);
  const fertile = isBetween(date, cycle.fertileStart, cycle.fertileEnd);
  const ovulation = toISO(date) === toISO(cycle.ovulationDate);
  const fertileMucus = ["watery", "egg-white"].includes(log.cervicalMucus);
  const positiveOPK = ["positive", "peak"].includes(log.opk);
  const hasLog = Object.values(log).some(Boolean);

  return { iso, log, cycle, explicitPeriodFlow, knownPeriod, actualPeriod, predictedPeriod, fertile, ovulation, fertileMucus, positiveOPK, hasLog };
}

function runLogicTests() {
  const data = {
    cycleLengthFallback: 28,
    periodLengthFallback: 5,
    logs: {
      "2026-01-01": { periodStart: true, periodFlow: "medium" },
      "2026-01-02": { periodFlow: "light" },
      "2026-01-29": { periodStart: true, periodFlow: "medium" },
      "2026-02-26": { periodStart: true, periodFlow: "medium" },
    },
  };

  const stats = getCycleStats(data);
  console.assert(stats.averageCycleLength === 28, "Average cycle should be 28 days");
  console.assert(stats.shortestCycle === 28, "Shortest cycle should be 28 days");
  console.assert(toISO(findCycleForDate(data, fromISO("2026-02-10")).ovulationDate) === "2026-02-12", "Ovulation estimate should be next period minus 14 days");
  console.assert(getDayInfo(data, fromISO("2026-02-10")).fertile === true, "Feb 10 should be inside fertile window");
  console.assert(getDayInfo(data, fromISO("2026-02-12")).ovulation === true, "Feb 12 should be ovulation estimate");

  const dataWithEnds = {
    cycleLengthFallback: 28,
    periodLengthFallback: 5,
    logs: {
      "2026-01-01": { periodStart: true, periodFlow: "medium" },
      "2026-01-04": { periodEnd: true, periodFlow: "light" },
      "2026-01-30": { periodStart: true, periodFlow: "medium" },
      "2026-02-02": { periodEnd: true, periodFlow: "light" },
    },
  };
  const endStats = getCycleStats(dataWithEnds);
  console.assert(endStats.averageCycleLength === 29, "Period start dates should update average cycle length");
  console.assert(endStats.averagePeriodLength === 4, "Period end dates should update average period length inclusively");
  console.assert(getDayInfo(dataWithEnds, fromISO("2026-01-02")).actualPeriod === true, "Dates between period start and end should count as period days");
  console.assert(getDayInfo(dataWithEnds, fromISO("2026-01-03")).knownPeriod === true, "Dates between explicit start and end should be known period days");

  const dataWithOPK = {
    cycleLengthFallback: 44,
    periodLengthFallback: 5,
    logs: {
      "2026-01-01": { periodStart: true, periodFlow: "medium" },
      "2026-02-14": { periodStart: true, periodFlow: "medium" },
      "2026-03-01": { opk: "positive" },
    },
  };
  const opkCycle = findCycleForDate(dataWithOPK, fromISO("2026-03-01"));
  console.assert(toISO(opkCycle.ovulationDate) === "2026-03-02", "Positive OPK should shift ovulation estimate to the next day");
  console.assert(toISO(opkCycle.fertileStart) === "2026-02-25", "Positive OPK should shift fertile window to five days before adjusted ovulation");

  const dataWithMucus = {
    cycleLengthFallback: 44,
    periodLengthFallback: 5,
    logs: {
      "2026-05-01": { periodStart: true, periodFlow: "medium" },
      "2026-05-23": { cervicalMucus: "egg-white" },
    },
  };
  const mucusCycle = findCycleForDate(dataWithMucus, fromISO("2026-05-23"));
  console.assert(toISO(mucusCycle.ovulationDate) === "2026-05-31", "Fertile mucus should not move ovulation by itself");
  console.assert(toISO(mucusCycle.fertileStart) === "2026-05-23", "Fertile mucus before the predicted fertile window should extend the fertile window backward");
  console.assert(mucusCycle.fertileStartSource === "mucus", "Fertile window source should show mucus when mucus extends the window");

  const messyImport = normalizeImportedData({ cycleLengthFallback: "44", periodLengthFallback: "5", logs: { "2026-04-01": { periodStart: true, periodFlow: "medium", nonsense: true }, nope: { periodStart: true } } });
  console.assert(messyImport.cycleLengthFallback === 44, "Imported cycle length should normalize to a number");
  console.assert(Object.keys(messyImport.logs).length === 1, "Import should keep only valid ISO date logs");
  console.assert(messyImport.logs["2026-04-01"].periodStart === true, "Import should clean daily logs");
}

if (typeof window !== "undefined") {
  runLogicTests();
}

function ToggleButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
        active ? "border-[#0e7490] bg-[#dff7fb] text-[#075985]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function CalendarCell({ date, monthDate, data, onOpenDay }) {
  const info = getDayInfo(data, date);
  const currentMonth = sameMonth(date, monthDate);

  let bg = "bg-white";
  if (info.predictedPeriod) bg = "bg-pink-50";
  if (info.fertile) bg = "bg-yellow-100";
  if (info.actualPeriod) bg = "bg-rose-100";
  if (info.ovulation) bg = "bg-yellow-200";

  return (
    <button
      type="button"
      onClick={() => onOpenDay(toISO(date))}
      className={`relative min-h-[66px] cursor-pointer border border-slate-100 p-1 text-left sm:min-h-[76px] ${bg} ${currentMonth ? "text-slate-700" : "text-slate-300"}`}
      aria-label={`Open log for ${toISO(date)}`}
    >
      <span className="block text-center text-sm font-bold">{date.getDate()}</span>
      <div className="absolute bottom-1 left-1 right-1 flex flex-wrap items-center justify-center gap-1">
        {info.log.periodStart && <span className="rounded bg-rose-600 px-1 text-[9px] font-bold text-white">START</span>}
        {info.log.periodEnd && <span className="rounded bg-rose-400 px-1 text-[9px] font-bold text-white">END</span>}
        {info.actualPeriod && <Icon name="droplet" size={12} className="text-rose-500" />}
        {info.predictedPeriod && <Icon name="droplet" size={12} className="text-pink-300" />}
        {info.fertile && <Icon name="sparkles" size={13} className="text-yellow-500" />}
        {info.ovulation && <span className="h-3 w-3 rounded-full bg-cyan-600" />}
        {info.log.intercourse && <Icon name="heart" size={13} className="text-red-500" />}
        {info.log.spotting && <span className="h-2 w-2 rounded-full bg-rose-300" />}
        {info.fertileMucus && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
        {info.positiveOPK && <span className="rounded bg-purple-600 px-1 text-[9px] font-bold text-white">LH</span>}
        {info.hasLog && !info.actualPeriod && !info.log.intercourse && !info.fertileMucus && <Icon name="note" size={12} className="text-slate-400" />}
      </div>
    </button>
  );
}

function DayModal({ iso, data, setData, onClose }) {
  const log = cleanLog(data.logs[iso]);
  const date = fromISO(iso);
  const info = getDayInfo(data, date);

  function setLog(patch) {
    setData((prev) => ({
      ...prev,
      logs: {
        ...prev.logs,
        [iso]: cleanLog({ ...(prev.logs[iso] || {}), ...patch }),
      },
    }));
  }

  function clearDay() {
    setData((prev) => {
      const logs = { ...prev.logs };
      delete logs[iso];
      return { ...prev, logs };
    });
    onClose();
  }

  function togglePeriodStart() {
    const nextStart = !log.periodStart;
    setLog({ periodStart: nextStart, periodFlow: nextStart && log.periodFlow === "none" ? "medium" : log.periodFlow });
  }

  function setFlow(flow) {
    setLog({
      periodFlow: flow,
      periodStart: flow === "none" ? false : log.periodStart,
      periodEnd: flow === "none" ? false : log.periodEnd,
    });
  }

  function togglePeriodEnd() {
    const nextEnd = !log.periodEnd;
    setLog({ periodEnd: nextEnd, periodFlow: nextEnd && log.periodFlow === "none" ? "light" : log.periodFlow });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-0 pb-[env(safe-area-inset-bottom)] sm:items-center sm:p-4">
      <div className="max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</h2>
            <p className="text-sm text-slate-500">Cycle day {Math.max(1, info.cycle.cycleDay)} · Ovulation estimate {formatDateLong(info.cycle.ovulationDate)} {info.cycle.ovulationSource !== "calendar" ? `(from LH ${formatDateLong(info.cycle.opkDate)})` : ""}</p>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-full bg-slate-100 p-2" aria-label="Close day log"><Icon name="close" size={22} /></button>
        </div>

        <div className="space-y-5">
          <section>
            <h3 className="mb-2 font-bold text-slate-700">Period</h3>
            <div className="grid grid-cols-2 gap-2">
              <ToggleButton active={!!log.periodStart} onClick={togglePeriodStart}>Period start date</ToggleButton>
              <ToggleButton active={!!log.periodEnd} onClick={togglePeriodEnd}>Period end date</ToggleButton>
              <ToggleButton active={!!log.spotting} onClick={() => setLog({ spotting: !log.spotting })}>Spotting</ToggleButton>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {["none", "light", "medium", "heavy"].map((flow) => (
                <ToggleButton key={flow} active={log.periodFlow === flow} onClick={() => setFlow(flow)}>
                  {flow[0].toUpperCase() + flow.slice(1)}
                </ToggleButton>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-bold text-slate-700">Cervical mucus</h3>
            <div className="grid grid-cols-2 gap-2">
              {["dry", "sticky", "creamy", "watery", "egg-white"].map((mucus) => (
                <ToggleButton key={mucus} active={log.cervicalMucus === mucus} onClick={() => setLog({ cervicalMucus: log.cervicalMucus === mucus ? "" : mucus })}>
                  {mucus === "egg-white" ? "Egg-white" : mucus[0].toUpperCase() + mucus.slice(1)}
                </ToggleButton>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-bold text-slate-700">LH / OPK test</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "negative", label: "Negative", hint: "Fainter than control" },
                { value: "positive", label: "Positive", hint: "Same as control" },
                { value: "peak", label: "Peak", hint: "Darker than control" },
              ].map((opk) => (
                <ToggleButton key={opk.value} active={log.opk === opk.value} onClick={() => setLog({ opk: log.opk === opk.value ? "" : opk.value })}>
                  <span className="block">{opk.label}</span>
                  <span className="block text-[11px] font-medium opacity-75">{opk.hint}</span>
                </ToggleButton>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-bold text-slate-700">Intercourse</h3>
            <ToggleButton active={!!log.intercourse} onClick={() => setLog({ intercourse: !log.intercourse })}>Logged intercourse</ToggleButton>
          </section>

          <section>
            <h3 className="mb-2 font-bold text-slate-700">Notes</h3>
            <textarea
              value={log.notes || ""}
              onChange={(e) => setLog({ notes: e.target.value })}
              placeholder="Symptoms, mood, cramps, timing notes..."
              className="min-h-[90px] w-full rounded-2xl border border-slate-200 p-3 outline-none focus:border-cyan-500"
            />
          </section>
        </div>

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 cursor-pointer rounded-2xl bg-cyan-700 px-4 py-3 font-bold text-white">Save</button>
          <button type="button" onClick={clearDay} className="cursor-pointer rounded-2xl bg-slate-100 px-4 py-3 font-bold text-slate-500">Clear</button>
        </div>
      </div>
    </div>
  );
}

function StatsPage({ data, setData }) {
  const stats = getCycleStats(data);
  const cycle = findCycleForDate(data, new Date());

  const statCards = [
    ["Average cycle", `${stats.averageCycleLength} days`],
    ["Average period", `${stats.averagePeriodLength} days`],
    ["Shortest cycle", stats.shortestCycle ? `${stats.shortestCycle} days` : "Need 2 starts"],
    ["Longest cycle", stats.longestCycle ? `${stats.longestCycle} days` : "Need 2 starts"],
    ["Median cycle", stats.medianCycle ? `${stats.medianCycle} days` : "Need 2 starts"],
    ["Shortest period", stats.shortestPeriod ? `${stats.shortestPeriod} days` : "Need dates"],
    ["Longest period", stats.longestPeriod ? `${stats.longestPeriod} days` : "Need dates"],
    ["Logged days", stats.loggedDays],
    ["Intercourse days", stats.intercourseDays],
    ["Fertile mucus days", stats.fertileMucusDays],
    ["Positive LH days", stats.positiveOPKDays],
  ];

  return (
    <main className="space-y-4 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <section className="rounded-3xl bg-gradient-to-br from-cyan-800 to-cyan-600 p-5 text-white shadow-lg">
        <h2 className="text-2xl font-bold">Current estimates</h2>
        <p className="mt-2 text-cyan-50">Next period: <b>{formatDateLong(cycle.nextStart)}</b></p>
        <p className="text-cyan-50">Estimated fertile window: <b>{formatDateLong(cycle.fertileStart)} to {formatDateLong(cycle.fertileEnd)}</b>{cycle.fertileStartSource === "mucus" ? " (extended by fertile mucus)" : ""}</p>
        <p className="text-cyan-50">Estimated ovulation: <b>{formatDateLong(cycle.ovulationDate)}</b> {cycle.ovulationSource !== "calendar" ? `(adjusted from ${cycle.ovulationSource} LH on ${formatDateLong(cycle.opkDate)})` : "(calendar estimate)"}</p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        {statCards.map(([label, value]) => (
          <div key={label} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-500">{label}</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-lg font-bold">Cycle history</h3>
        {stats.periodStarts.length ? (
          <div className="space-y-2">
            {stats.periodStarts.map((start, i) => (
              <div key={start} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3 text-sm">
                <span className="font-semibold">{formatDateLong(fromISO(start))}</span>
                <span className="text-slate-500">{i > 0 ? `${diffDays(fromISO(stats.periodStarts[i - 1]), fromISO(start))} day cycle` : "First logged cycle"} · {stats.periodLengths[i] || data.periodLengthFallback} day period</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500">Log period start dates on the calendar to build stats.</p>
        )}
      </section>
    </main>
  );
}

function SettingsPage({ data, setData }) {
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");
  const [exportText, setExportText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  function exportData() {
    const payloadText = JSON.stringify(makeExportPayload(data), null, 2);
    setExportText(payloadText);
    setImportError("");
    setImportSuccess("Export ready. Copy the backup text below, or use Download JSON if your browser allows it.");
  }

  function downloadExport() {
    const payloadText = exportText || JSON.stringify(makeExportPayload(data), null, 2);
    const blob = new Blob([payloadText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `egg-oracle-export-${toISO(new Date())}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function importData(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setImportError("");
    setImportSuccess("");
    setConfirmDelete(false);
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const nextData = normalizeImportedData(parsed.data || parsed);
        setData(nextData);
        setImportSuccess("Import complete. Your local data has been replaced with the imported file.");
      } catch (error) {
        setImportError(error?.message || "Could not import that file.");
      }
    };
    reader.onerror = () => setImportError("Could not read that file.");
    reader.readAsText(file);
  }

  function importFromText() {
    setImportError("");
    setImportSuccess("");
    setConfirmDelete(false);
    try {
      const parsed = JSON.parse(exportText || "{}");
      const nextData = normalizeImportedData(parsed.data || parsed);
      setData(nextData);
      setImportSuccess("Import complete from pasted backup text.");
    } catch (error) {
      setImportError(error?.message || "Could not import that pasted text.");
    }
  }

  function deleteAllData() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setImportError("");
      setImportSuccess("Tap Delete all data one more time to confirm.");
      return;
    }

    const fresh = defaultData();
    setData(fresh);
    saveData(fresh);
    setExportText("");
    setConfirmDelete(false);
    setImportError("");
    setImportSuccess("All local data was deleted.");
  }

  return (
    <main className="space-y-4 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <section className="rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
        <p className="mt-1 text-sm text-slate-500">Backup, restore, or purge the tiny egg ledger. Data stays in this browser unless you export it.</p>
      </section>

      <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-lg font-bold">Data</h3>
        <div className="space-y-3">
          <button type="button" onClick={exportData} className="block w-full cursor-pointer rounded-2xl bg-cyan-700 px-4 py-3 text-left font-bold text-white">
            <span className="flex items-center justify-between"><span><Icon name="export" size={18} className="mr-2" />Export data</span><span className="text-sm font-semibold text-cyan-100">Show backup text</span></span>
          </button>

          <label className="flex w-full cursor-pointer items-center justify-between rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 font-bold text-cyan-900">
            <span><Icon name="import" size={18} className="mr-2" />Import data</span>
            <span className="text-sm font-semibold text-cyan-700">Choose file</span>
            <input type="file" accept="application/json,.json" onChange={importData} className="hidden" />
          </label>

          <button type="button" onClick={deleteAllData} className={`block w-full cursor-pointer rounded-2xl px-4 py-3 text-left font-bold ${confirmDelete ? "bg-rose-700 text-white" : "bg-rose-50 text-rose-700"}`}>
            <span className="flex items-center justify-between"><span><Icon name="trash" size={18} className="mr-2" />{confirmDelete ? "Confirm delete all data" : "Delete all data"}</span><span className={`text-sm font-semibold ${confirmDelete ? "text-rose-100" : "text-rose-500"}`}>Local only</span></span>
          </button>
        </div>

        {exportText && (
          <div className="mt-3 space-y-2 rounded-2xl bg-slate-50 p-3">
            <div className="flex gap-2">
              <button type="button" onClick={downloadExport} className="flex-1 cursor-pointer rounded-xl bg-cyan-700 px-3 py-2 text-sm font-bold text-white">Download JSON</button>
              <button type="button" onClick={() => navigator.clipboard?.writeText(exportText)} className="flex-1 cursor-pointer rounded-xl bg-white px-3 py-2 text-sm font-bold text-cyan-800 shadow-sm">Copy text</button>
              <button type="button" onClick={importFromText} className="flex-1 cursor-pointer rounded-xl bg-white px-3 py-2 text-sm font-bold text-cyan-800 shadow-sm">Import text</button>
            </div>
            <textarea
              value={exportText}
              onChange={(e) => setExportText(e.target.value)}
              className="h-40 w-full rounded-xl border border-slate-200 p-2 font-mono text-xs"
              aria-label="Exported data text"
            />
          </div>
        )}
        {importError && <p className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{importError}</p>}
        {importSuccess && <p className="mt-3 rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{importSuccess}</p>}
      </section>

      <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-lg font-bold">Manual defaults</h3>
        <p className="mb-3 text-sm text-slate-500">Used until you have enough real cycle data. Set to 44 days for your current usual cycle.</p>
        <label className="mb-1 block text-sm font-semibold">Default cycle length</label>
        <input
          type="number"
          min="15"
          max="60"
          value={data.cycleLengthFallback}
          onChange={(e) => setData((prev) => ({ ...prev, cycleLengthFallback: clampNumber(e.target.value, 44, 15, 60) }))}
          className="mb-3 w-full rounded-2xl border border-slate-200 p-3"
        />
        <label className="mb-1 block text-sm font-semibold">Default period length</label>
        <input
          type="number"
          min="1"
          max="14"
          value={data.periodLengthFallback}
          onChange={(e) => setData((prev) => ({ ...prev, periodLengthFallback: clampNumber(e.target.value, 5, 1, 14) }))}
          className="w-full rounded-2xl border border-slate-200 p-3"
        />
      </section>
    </main>
  );
}

function CalendarPage({ data, monthDate, setMonthDate, onOpenDay }) {
  const days = useMemo(() => buildMonthDays(monthDate), [monthDate]);
  const cycle = findCycleForDate(data, new Date());

  return (
    <main className="p-4 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setMonthDate((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="cursor-pointer rounded-full bg-slate-100 p-2" aria-label="Previous month"><Icon name="left" size={34} /></button>
          <h2 className="text-xl font-bold text-slate-900">{monthTitle(monthDate)}</h2>
          <button type="button" onClick={() => setMonthDate((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="cursor-pointer rounded-full bg-slate-100 p-2" aria-label="Next month"><Icon name="right" size={34} /></button>
        </div>
        <div className="mt-3 rounded-2xl bg-cyan-50 p-3 text-sm text-cyan-900">
          Fertile window estimate: <b>{formatDateLong(cycle.fertileStart)} to {formatDateLong(cycle.fertileEnd)}</b>{cycle.fertileStartSource === "mucus" ? " (extended by fertile mucus)" : ""}. Ovulation estimate: <b>{formatDateLong(cycle.ovulationDate)}</b> {cycle.ovulationSource !== "calendar" ? `(adjusted from LH)` : ""}.
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl bg-white shadow-sm">
        <div className="grid grid-cols-7 bg-slate-50 text-center text-xs font-bold text-slate-500">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={`${d}-${i}`} className="py-3">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((date) => <CalendarCell key={toISO(date)} date={date} monthDate={monthDate} data={data} onOpenDay={onOpenDay} />)}
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-2 text-sm text-slate-600">
        <div className="rounded-2xl bg-rose-100 p-3"><Icon name="droplet" size={15} className="mr-1 text-rose-500" /> Period</div>
        <div className="rounded-2xl bg-yellow-100 p-3"><Icon name="sparkles" size={15} className="mr-1 text-yellow-500" /> Fertile</div>
        <div className="rounded-2xl bg-cyan-50 p-3"><span className="mr-2 inline-block h-3 w-3 rounded-full bg-cyan-600" /> Ovulation</div>
        <div className="rounded-2xl bg-white p-3 shadow-sm"><Icon name="heart" size={15} className="mr-1 text-red-500" /> Intercourse</div>
        <div className="rounded-2xl bg-purple-50 p-3"><span className="mr-1 rounded bg-purple-600 px-1 text-[10px] font-bold text-white">LH</span> Positive OPK</div>
      </section>
    </main>
  );
}

export default function EggOracleTrackingFirst() {
  const [data, setData] = useState(defaultData());
  const [activeTab, setActiveTab] = useState("calendar");
  const [monthDate, setMonthDate] = useState(new Date());
  const [selectedISO, setSelectedISO] = useState(null);

  useEffect(() => setData(loadData()), []);
  useEffect(() => saveData(data), [data]);

  function openToday() {
    setSelectedISO(toISO(new Date()));
  }

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-800">
      <div className="mx-auto min-h-dvh w-full max-w-md bg-slate-50 shadow-2xl">
        <header className="bg-cyan-800 px-5 pb-5 pt-[calc(2rem+env(safe-area-inset-top))] text-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Egg Oracle</h1>
              <p className="text-sm text-cyan-100">Tracking first. Pretty later. Tiny egg bureaucracy.</p>
            </div>
            <button type="button" onClick={openToday} className="cursor-pointer rounded-full bg-white/15 p-3" aria-label="Log today"><Icon name="plus" size={26} /></button>
          </div>
        </header>

        {activeTab === "calendar" && <CalendarPage data={data} monthDate={monthDate} setMonthDate={setMonthDate} onOpenDay={setSelectedISO} />}
        {activeTab === "stats" && <StatsPage data={data} setData={setData} />}
        {activeTab === "settings" && <SettingsPage data={data} setData={setData} />}

        <nav className="fixed bottom-0 left-1/2 grid w-full max-w-md -translate-x-1/2 grid-cols-3 border-t border-slate-200 bg-white px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgba(15,23,42,.08)]">
          <button
            type="button"
            onClick={() => setActiveTab("calendar")}
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl py-3 font-bold ${activeTab === "calendar" ? "bg-cyan-700 text-white" : "text-slate-500"}`}
          >
            <Icon name="calendar" size={20} /> Calendar
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("stats")}
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl py-3 font-bold ${activeTab === "stats" ? "bg-cyan-700 text-white" : "text-slate-500"}`}
          >
            <Icon name="chart" size={20} /> Stats
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("settings")}
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl py-3 font-bold ${activeTab === "settings" ? "bg-cyan-700 text-white" : "text-slate-500"}`}
          >
            <Icon name="settings" size={20} /> Settings
          </button>
        </nav>

        {selectedISO && <DayModal iso={selectedISO} data={data} setData={setData} onClose={() => setSelectedISO(null)} />}
      </div>
    </div>
  );
}
