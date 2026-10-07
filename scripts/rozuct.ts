// === CLI výpočet rozúčtu z lokálního JSON ===
// Načte data/marek.json (stejný formát jako záloha z appky), spočítá rozúčet
// za každý zaznamenaný měsíc a vypíše ho do terminálu.
//
//   npx vite-node scripts/rozuct.ts
//
// Data v data/ jsou gitignorovaná — Markovy odečty nepatří do public repa.

import { readFileSync } from 'node:fs';
import { calculateBilling, checkConsistency, pricesPerMWh, calculateFeedIn } from '../src/calc';
import { importJson, consumptionFromReadings, type MonthlyRecord, type Baseline } from '../src/storage';

const path = process.argv[2] ?? 'data/marek.json';
const state = importJson(readFileSync(path, 'utf8'));

const czk = (x: number) => `${x.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Kč`;
const kwh = (x: number) => `${x.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} kWh`;

// Readings the given month computes its consumption against: the previous
// month's readings, or the baseline for the oldest month.
function previousReadings(
  records: MonthlyRecord[],
  baseline: Baseline | null,
  index: number
) {
  return index > 0 ? records[index - 1].readings : baseline?.readings;
}

if (state.baseline) {
  console.log(`\n=== BOD NULA (${state.baseline.date}) ===`);
  for (const r of state.baseline.readings) {
    const name = state.agreement.flats.find((f) => f.id === r.id)?.name ?? r.id;
    console.log(`  ${name.padEnd(18)} T1 ${String(r.peak).padStart(9)}  T2 ${String(r.offPeak).padStart(9)}`);
  }
} else {
  console.log('\n⚠️  Žádný bod nula — nejstarší měsíc nebude mít proti čemu počítat.');
}

state.records.forEach((rec, i) => {
  const prev = previousReadings(state.records, state.baseline, i);
  const consumption = consumptionFromReadings(rec.readings, prev);
  const result = calculateBilling(rec.meter, consumption, rec.tariff, state.agreement, rec.months ?? 1);
  const prices = pricesPerMWh(rec.tariff);

  console.log(`\n=== ${rec.period}${(rec.months ?? 1) > 1 ? ` (blok ${rec.months} měsíců)` : ''}${rec.readingDate ? ` (odečet ${rec.readingDate})` : ''} ===`);
  console.log(
    `  SEMS+: výroba ${kwh(rec.meter.production)} | spotřeba domu ${kwh(rec.meter.houseConsumption)} | ` +
      `přetoky ${kwh(rec.meter.feedIn)} | nákup ze sítě ${kwh(rec.meter.gridPurchase)}`
  );
  console.log(
    `  Z FVE+baterie: ${kwh(result.pvKwh)} | společná spotřeba: ${kwh(result.commonKwh)} | ` +
      `Σ byty: ${kwh(result.flatsSum)}`
  );
  console.log(
    `  Ceny: VT ${(prices.peak / 1000).toFixed(2)} | NT ${(prices.offPeak / 1000).toFixed(2)} | ` +
      `průměr ${(result.avgPriceMWh / 1000).toFixed(2)} Kč/kWh (bez DPH)`
  );
  console.log(`  Úspora z FVE celkem: ${czk(result.totalSavings)} (z toho bytům ${czk(result.flatsBonusTotal)})`);

  console.log('');
  const head = ['Byt', 'VT', 'NT', 'Celkem', 'Síť', 'FVE bonus', 'Společná', 'Fix', 'PLATBA'];
  const rows = result.rows.map((r) => [
    r.name,
    kwh(r.peak),
    kwh(r.offPeak),
    kwh(r.consumption),
    czk(r.gridCost),
    `−${czk(r.pvBonus)}`,
    czk(r.common),
    czk(r.fixed),
    czk(r.total),
  ]);
  const widths = head.map((h, c) => Math.max(h.length, ...rows.map((r) => r[c].length)));
  const line = (cells: string[]) => cells.map((c, j) => c.padStart(widths[j])).join('  ');
  console.log('  ' + line(head));
  console.log('  ' + widths.map((w) => '─'.repeat(w)).join('  '));
  for (const r of rows) console.log('  ' + line(r));
  console.log('  ' + widths.map((w) => '─'.repeat(w)).join('  '));
  console.log(`  CELKEM: ${czk(result.grandTotal)}`);

  const warnings = checkConsistency(rec.meter, consumption);
  if (prev) {
    for (const cur of rec.readings) {
      const p = prev.find((x) => x.id === cur.id);
      if (!p || cur.firstReading) continue;
      if (cur.peak < p.peak || cur.offPeak < p.offPeak) {
        const name = state.agreement.flats.find((f) => f.id === cur.id)?.name ?? cur.id;
        warnings.push(`${name}: stav měřidla klesl proti minulému odečtu — překlep?`);
      }
    }
  }
  if (warnings.length) {
    console.log('\n  ⚠️  KONTROLY:');
    for (const w of warnings) console.log(`     • ${w}`);
  } else {
    console.log('\n  ✓ kontroly konzistence bez námitek');
  }
});

// Feed-in is settled once a year (1.11.→31.10.), so show the accumulated total.
const feedInKwh = state.records.reduce((s, r) => s + r.meter.feedIn, 0);
if (feedInKwh > 0) {
  const latest = state.records[state.records.length - 1].tariff;
  const payout = calculateFeedIn(feedInKwh, latest, state.agreement);
  console.log(`\n=== PŘETOKY (kumulativně za zadané měsíce) ===`);
  console.log(`  ${kwh(feedInKwh)} × ${latest.feedInMWh} Kč/MWh = ${czk(payout.revenue)}`);
  for (const [id, amount] of Object.entries(payout.payouts)) {
    const name = state.agreement.flats.find((f) => f.id === id)?.name ?? id;
    console.log(`  ${name.padEnd(18)} ${czk(amount)}`);
  }
}
console.log('');
