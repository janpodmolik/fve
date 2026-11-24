// === Přehled vyúčtování do souborů ===
// Spočítá rozúčet za všechny měsíce ze zálohy appky a zapíše ho jako tabulky,
// které přečte člověk, Excel i libovolná AI bez spouštění kódu:
//
//   vyuctovani-byty.csv   jeden řádek = jeden byt v jednom období
//   vyuctovani-dum.csv    jeden řádek = celý dům v jednom období (SEMS, společná, kontroly)
//   vyuctovani.md         čitelný přehled plateb + přetoky
//
//   npm run vyuctovani
//   npx vite-node scripts/vyuctovani.ts <zaloha.json> <vystupni-slozka>
//
// Počítá stejným kódem jako appka (src/calc.ts), takže čísla sedí na korunu.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { calculateBilling, agreementFor, checkConsistency, feedInByYear, splitPvShares } from '../src/calc';
import { importJson, consumptionFromReadings, previousReadings } from '../src/storage';
import { defaultStatePath } from './paths';

const inPath = process.argv[2] ?? defaultStatePath();
const outDir = process.argv[3] ?? 'dum/vystupy';
const state = importJson(readFileSync(inPath, 'utf8'));
mkdirSync(outDir, { recursive: true });

const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
const label = (period: string, months = 1): string => {
  const [y, m] = period.split('-').map(Number);
  if (months <= 1) return `${MONTHS[m - 1]} ${y}`;
  const first = new Date(y, m - months, 1);
  return `${MONTHS[first.getMonth()]}${first.getFullYear() === y ? '' : ` ${first.getFullYear()}`}–${MONTHS[m - 1]} ${y}`;
};
const csvCell = (v: string | number): string => {
  const s = typeof v === 'number' ? String(Math.round(v * 100) / 100) : v;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: (string | number)[][]): string => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
const czk = (x: number): string => `${Math.round(x).toLocaleString('cs-CZ')} Kč`;
const kwh = (x: number): string => x.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });

const flats = state.agreement.flats;
const byty: (string | number)[][] = [[
  'obdobi', 'datum_odectu', 'mesicu', 'byt_id', 'byt', 'neobsazeny',
  'spotreba_vt_kwh', 'spotreba_nt_kwh', 'spotreba_kwh',
  'sit_kc', 'fve_bonus_kc', 'spolecna_kc', 'stale_platby_kc', 'platba_kc',
]];
const dum: (string | number)[][] = [[
  'obdobi', 'datum_odectu', 'mesicu', 'vyroba_kwh', 'spotreba_domu_kwh', 'pretoky_kwh', 'nakup_ze_site_kwh',
  'z_fve_a_baterie_kwh', 'byty_kwh', 'spolecna_kwh', 'dni', 'spolecna_kwh_den', 'platby_celkem_kc', 'kontroly',
]];
const md: string[] = [];
md.push('| Období | ' + flats.map((f) => f.name).join(' | ') + ' | Celkem | Společná větev |');
md.push('|---|' + flats.map(() => '---:').join('|') + '|---:|---:|');

// Days between two readings ('YYYY-MM-DD'); null when either date is missing.
const daysBetween = (from?: string, to?: string): number | null =>
  from && to ? Math.round((Date.parse(to) - Date.parse(from)) / 86400000) : null;
let prevDate: string | undefined = state.baseline?.date;

for (const rec of state.records) {
  const prev = previousReadings(state.records, state.baseline, rec.period);
  const months = rec.months ?? 1;
  const consumption = consumptionFromReadings(rec.readings, prev);
  const r = calculateBilling(rec.meter, consumption, rec.tariff, agreementFor(state.agreement, rec.vacant), months);
  const warnings = prev ? checkConsistency(rec.meter, consumption) : ['chybí předchozí odečet, vyúčtování nevzniká'];
  const days = daysBetween(prevDate, rec.readingDate);
  const perDay = days ? Math.round((r.commonKwh / days) * 10) / 10 : null;
  prevDate = rec.readingDate ?? prevDate;
  for (const row of r.rows) {
    byty.push([
      rec.period, rec.readingDate ?? '', months, row.id, row.name, rec.vacant?.includes(row.id) ? 'ano' : 'ne',
      row.peak, row.offPeak, row.consumption, row.gridCost, row.pvBonus, row.common, row.fixed, row.total,
    ]);
  }
  dum.push([
    rec.period, rec.readingDate ?? '', months, rec.meter.production, rec.meter.houseConsumption, rec.meter.feedIn,
    rec.meter.gridPurchase, r.pvKwh, r.flatsSum, r.commonKwh, days ?? '', perDay ?? '', r.grandTotal,
    warnings.length ? warnings.join(' | ') : 'v pořádku',
  ]);
  md.push(
    `| ${label(rec.period, months)} | ` +
      r.rows.map((row) => czk(row.total) + (rec.vacant?.includes(row.id) ? ' *' : '')).join(' | ') +
      ` | ${czk(r.grandTotal)} | ${kwh(r.commonKwh)} kWh${perDay !== null ? ` (${kwh(perDay)} za den)` : ''} |`
  );
}

const feedIn = feedInByYear(
  state.records.map((r) => ({ period: r.period, months: r.months, feedIn: r.meter.feedIn, priceMWh: r.tariff.feedInMWh })),
  state.agreement.feedInFrom
);
const last = state.records[state.records.length - 1];
const out = [
  '# Vyúčtování elektřiny po měsících',
  '',
  `Vygenerováno ze souboru \`${inPath}\`. Poslední období: ${last ? label(last.period, last.months ?? 1) : "žádné"}.`,
  'Tenhle soubor se nepřepisuje ručně: po změně dat ho znovu vytvoří `npm run vyuctovani`.',
  '',
  '## Kolik platí který byt (s DPH)',
  '',
  ...md,
  '',
  '\\* byt byl v tom období veden jako neobsazený: platí svůj díl stálých plateb, společnou spotřebu ne.',
  '',
  'Platba bytu = jeho spotřeba za ceny ze sítě − FVE bonus (jen vlastníci FVE) + podíl na společné spotřebě + podíl na stálých platbách.',
  'Jsou to VYPOČTENÉ částky, kolik na který byt připadá. Jestli a kdy si je byty mezi sebou zaplatily, tady není.',
  'Společná větev je výpočet (spotřeba domu minus tři byty), žádný elektroměr ji neměří.',
  '',
  '## Co je v CSV souborech',
  '',
  '- `vyuctovani-byty.csv`: jeden řádek = jeden byt v jednom období. `spotreba_*_kwh` je spotřeba bytu, sloupce `*_kc` jsou v Kč **s DPH**: `sit_kc` (spotřeba za ceny ze sítě), `fve_bonus_kc` (odečítá se), `spolecna_kc`, `stale_platby_kc`, `platba_kc` (výsledek).',
  '- `vyuctovani-dum.csv`: jeden řádek = celý dům v jednom období. Čísla ze střídače v kWh, `byty_kwh` (součet podružek), `spolecna_kwh` (výpočet), `dni` (od předchozího odečtu), `spolecna_kwh_den`, `platby_celkem_kc` (součet plateb bytů s DPH) a `kontroly` (varování k datům, nebo „v pořádku").',
  '',
  '## Přetoky do sítě (výplata vlastníkům FVE)',
  '',
  ...(feedIn.length
    ? feedIn.flatMap((y) => {
        const split = Object.entries(splitPvShares(y.revenue, state.agreement))
          .map(([id, amount]) => `${flats.find((f) => f.id === id)?.name ?? id} ${czk(amount)}`)
          .join(', ');
        return [
          `- Zúčtovací rok ${y.year}: ${kwh(y.kwh)} kWh → ${czk(y.revenue)} (${split}).` +
            (y.unpaidKwh ? ` Dalších ${kwh(y.unpaidKwh)} kWh šlo do sítě před začátkem výkupu a neproplácí se.` : ''),
        ];
      })
    : ['- Zatím žádné.']),
  '',
  'Přetoky jsou odhad ze střídače. Dodavatel platí podle fakturačního elektroměru (registr 2.8.0) jednou ročně za období 1. 11. – 31. 10., konečné číslo je to z jeho vyúčtování.',
  '',
];

writeFileSync(join(outDir, 'vyuctovani-byty.csv'), csv(byty));
writeFileSync(join(outDir, 'vyuctovani-dum.csv'), csv(dum));
writeFileSync(join(outDir, 'vyuctovani.md'), out.join('\n'));
console.log(`→ ${outDir}/vyuctovani.md, vyuctovani-byty.csv, vyuctovani-dum.csv (${state.records.length} období z ${inPath})`);
