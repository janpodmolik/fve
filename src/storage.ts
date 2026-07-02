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
  records: MonthlyRecord[]; // sorted ascending by period
}

const KEY = 'fve-rozuct-v1';

// Fills in defaults and migrates older data — records saved before per-month
// tariffs existed inherit a copy of the then-global tariff.
function normalize(parsed: Partial<AppState>): AppState {
  const tariff = { ...DEFAULT_TARIFF, ...parsed.tariff };
  return {
    tariff,
    agreement: { ...DEFAULT_AGREEMENT, ...parsed.agreement },
    records: (parsed.records ?? []).map((r) => ({ ...r, tariff: { ...tariff, ...r.tariff } })),
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

// Flat consumption for the period = readings(now) − readings(previous). Zero if no previous.
export function consumptionFromReadings(
  current: FlatReadings[],
  previous: FlatReadings[] | undefined
): { id: string; peak: number; offPeak: number }[] {
  return current.map((c) => {
    const p = previous?.find((x) => x.id === c.id);
    return {
      id: c.id,
      peak: p ? Math.max(0, c.peak - p.peak) : 0,
      offPeak: p ? Math.max(0, c.offPeak - p.offPeak) : 0,
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
