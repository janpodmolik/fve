// === localStorage persistence + monthly record data model ===

import {
  DEFAULT_TARIFF,
  DEFAULT_AGREEMENT,
  type Tariff,
  type Agreement,
  type MeterData,
} from './calc';

// Meter readings for one flat in a given month (T1=peak, T2=off-peak).
export interface FlatReadings {
  id: string;
  peak: number; // T1 reading [kWh]
  offPeak: number; // T2 reading [kWh]
  // First reading after the flat was reconnected (e.g. after a renovation
  // with the breaker off): the meter wakes up with its historic register,
  // which must NOT be billed as this month's consumption. When set, this
  // month's consumption is 0 and the reading only serves as the new base.
  firstReading?: boolean;
}

// The very first reading of the submeters — a standalone starting point
// ("bod nula"), deliberately NOT a billed month. The oldest billed month
// computes its consumption against it.
export interface Baseline {
  date: string; // 'YYYY-MM-DD' — day the readings were taken
  readings: FlatReadings[];
}

// One monthly record = readings at the end of the period.
export interface MonthlyRecord {
  period: string; // 'YYYY-MM'
  meter: MeterData; // values for the period (not cumulative)
  readings: FlatReadings[]; // CUMULATIVE meter readings at end of period
  tariff: Tariff; // price list valid for THIS month — frozen copy, so a later
  // tariff change never silently rewrites already issued bills
  readingDate?: string; // 'YYYY-MM-DD' — the day the submeters were actually
  // read; documents e.g. a skewed first month that started mid-month
}

export interface AppState {
  tariff: Tariff;
  agreement: Agreement;
  baseline: Baseline | null; // null until the very first reading is taken
  records: MonthlyRecord[]; // sorted ascending by period
}

const KEY = 'fve-rozuct-v1';

// '2026-06' → '2026-07-01' (fallback baseline date for migrated data).
function firstDayOfNextMonth(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// Fills in defaults and migrates older data:
// - records saved before per-month tariffs existed inherit a copy of the
//   then-global tariff;
// - data saved before the explicit baseline existed stored the baseline as the
//   oldest "month" with zeroed SEMS numbers — convert it to a real baseline.
function normalize(parsed: Partial<AppState>): AppState {
  const tariff = { ...DEFAULT_TARIFF, ...parsed.tariff };
  let records = (parsed.records ?? [])
    .map((r) => ({ ...r, tariff: { ...tariff, ...r.tariff } }))
    .sort((a, b) => a.period.localeCompare(b.period));
  let baseline = parsed.baseline ?? null;
  if (!baseline && records.length) {
    const oldest = records[0];
    const m = oldest.meter;
    if (!m.production && !m.houseConsumption && !m.feedIn && !m.gridPurchase) {
      baseline = {
        date: oldest.readingDate ?? firstDayOfNextMonth(oldest.period),
        readings: oldest.readings,
      };
      records = records.slice(1);
    }
  }
  return {
    tariff,
    agreement: { ...DEFAULT_AGREEMENT, ...parsed.agreement },
    baseline,
    records,
  };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw) as Partial<AppState>);
  } catch {
    // corrupted data — start fresh
  }
  return {
    tariff: { ...DEFAULT_TARIFF },
    agreement: structuredClone(DEFAULT_AGREEMENT),
    baseline: null,
    records: [],
  };
}

export function saveState(s: AppState): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

// Finds the previous record (for computing consumption as a difference of readings).
export function previousRecord(records: MonthlyRecord[], period: string): MonthlyRecord | undefined {
  const earlier = records
    .filter((r) => r.period < period)
    .sort((a, b) => a.period.localeCompare(b.period));
  return earlier[earlier.length - 1];
}

// Flat consumption for the period = readings(now) − readings(previous).
// Zero if no previous, and zero for a flat's first reading after reconnection.
export function consumptionFromReadings(
  current: FlatReadings[],
  previous: FlatReadings[] | undefined
): { id: string; peak: number; offPeak: number }[] {
  return current.map((c) => {
    const p = previous?.find((x) => x.id === c.id);
    if (!p || c.firstReading) return { id: c.id, peak: 0, offPeak: 0 };
    return {
      id: c.id,
      peak: Math.max(0, c.peak - p.peak),
      offPeak: Math.max(0, c.offPeak - p.offPeak),
    };
  });
}

// Export / import full state (JSON backup).
export function exportJson(s: AppState): string {
  return JSON.stringify(s, null, 2);
}

export function importJson(raw: string): AppState {
  return normalize(JSON.parse(raw) as Partial<AppState>);
}
