// === Diagnostika spotřeby — bez účtování ===
// Ukáže, co podružky a SEMS+ říkají o spotřebě bytů a společné větve,
// přepočtené na kWh/den, aby se daly srovnat období různé délky.
// Slouží k hledání skryté spotřeby (např. wallbox na společném okruhu),
// ne k vyúčtování — žádné fixy, žádné ceny.
//
//   npx vite-node scripts/diagnostika.ts

import { readFileSync } from 'node:fs';
import { importJson, consumptionFromReadings, type MonthlyRecord, type Baseline } from '../src/storage';

const path = process.argv[2] ?? 'data/marek.json';
const state = importJson(readFileSync(path, 'utf8'));

const days = (from: string, to: string): number =>
  Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);

function previousReadings(records: MonthlyRecord[], baseline: Baseline | null, i: number) {
  return i > 0 ? records[i - 1].readings : baseline?.readings;
}

// The day a period started — the previous reading date, or the baseline date.
function periodStart(records: MonthlyRecord[], baseline: Baseline | null, i: number): string | undefined {
  return i > 0 ? records[i - 1].readingDate : baseline?.date;
}

const name = (id: string) => state.agreement.flats.find((f) => f.id === id)?.name ?? id;
const n1 = (x: number) => x.toFixed(1).padStart(8);
const n2 = (x: number) => x.toFixed(2).padStart(7);

console.log('\n════ SPOTŘEBA PO OBDOBÍCH (kWh a kWh/den) ════\n');

for (const [i, rec] of state.records.entries()) {
  const prev = previousReadings(state.records, state.baseline, i);
  const start = periodStart(state.records, state.baseline, i);
  const end = rec.readingDate;
  if (!prev || !start || !end) {
    console.log(`${rec.period}: chybí předchozí odečet nebo datum — přeskakuji\n`);
    continue;
  }
  const d = days(start, end);
  const cons = consumptionFromReadings(rec.readings, prev);
  const flatsSum = cons.reduce((s, c) => s + c.peak + c.offPeak, 0);

  console.log(`── ${rec.period}  (${start} → ${end}, ${d} dní)`);
  for (const c of cons) {
    const tot = c.peak + c.offPeak;
    console.log(
      `   ${name(c.id).padEnd(16)} VT ${n1(c.peak)}  NT ${n1(c.offPeak)}  Σ ${n1(tot)} kWh` +
        `   ${n2(tot / d)} kWh/den`
    );
  }
  console.log(`   ${'Σ BYTY'.padEnd(16)} ${' '.repeat(30)}Σ ${n1(flatsSum)} kWh   ${n2(flatsSum / d)} kWh/den`);

  // Common consumption needs the SEMS house figure; without it we can only
  // report the flats.
  const house = rec.meter.houseConsumption;
  if (house > 0) {
    const common = house - flatsSum;
    const pct = (100 * common) / house;
    console.log(`   ${'DŮM (SEMS+)'.padEnd(16)} ${' '.repeat(30)}Σ ${n1(house)} kWh   ${n2(house / d)} kWh/den`);
    console.log(
      `   ${'→ SPOLEČNÁ'.padEnd(16)} ${' '.repeat(30)}Σ ${n1(common)} kWh   ${n2(common / d)} kWh/den` +
        `   (${pct.toFixed(1)} % domu)`
    );
    if (common < 0) console.log('   ⚠️  Společná je NEGATIVNÍ — podružky hlásí víc než celý dům!');
  } else {
    console.log(`   ${'DŮM (SEMS+)'.padEnd(16)} ${' '.repeat(30)}— chybí, doplnit ze SEMS+`);
  }
  console.log('');
}

// Comparing kWh/day across periods is the point: it exposes a load that comes
// and goes (e.g. an EV charging on the shared circuit).
const withSems = state.records.filter((r) => r.meter.houseConsumption > 0);
if (withSems.length > 1) {
  console.log('════ SROVNÁNÍ SPOLEČNÉ VĚTVE (kWh/den) ════\n');
  for (const [i, rec] of state.records.entries()) {
    if (rec.meter.houseConsumption <= 0) continue;
    const prev = previousReadings(state.records, state.baseline, i);
    const start = periodStart(state.records, state.baseline, i);
    if (!prev || !start || !rec.readingDate) continue;
    const d = days(start, rec.readingDate);
    const flatsSum = consumptionFromReadings(rec.readings, prev).reduce((s, c) => s + c.peak + c.offPeak, 0);
    const perDay = (rec.meter.houseConsumption - flatsSum) / d;
    const bar = '█'.repeat(Math.round(perDay * 2));
    console.log(`   ${rec.period}  ${n2(perDay)} kWh/den  ${bar}`);
  }
  console.log('');
}
