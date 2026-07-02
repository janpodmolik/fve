import './style.css';
import {
  calculateBilling,
  checkConsistency,
  pricesPerMWh,
  splitPvShares,
  type MeterData,
} from './calc';
import {
  loadState,
  saveState,
  previousRecord,
  consumptionFromReadings,
  exportJson,
  importJson,
  type AppState,
  type MonthlyRecord,
} from './storage';

let state: AppState = loadState();
let currentPeriod: string = lastOrNewPeriod();
// Guided monthly flow: null = normal view, 0–3 = wizard step being shown.
let wizardStep: number | null = null;
// In-app user guide (the layman version of NAVOD.md).
let helpMode = false;
// Demo mode: shows sample data in memory only — nothing is persisted and the
// user's real state is restored on exit.
let demoMode = false;
let realState: AppState | null = null;

// All persistence goes through here so demo mode can never touch real data.
function persist() {
  if (!demoMode) saveState(state);
}

// When the user last downloaded a JSON backup — drives the backup nudge.
const EXPORT_KEY = 'fve-rozuct-last-export';

// Marks an element as screen-only (e.g. inputs and controls that would only
// clutter the printed statement).
function noPrint(n: HTMLElement): HTMLElement {
  n.classList.add('print:hidden');
  return n;
}

function lastOrNewPeriod(): string {
  if (state.records.length) return state.records[state.records.length - 1].period;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
// '2026-04' → 'duben 2026' — everything user-facing shows human month names.
function periodLabel(p: string): string {
  const [y, m] = p.split('-').map(Number);
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${y}` : p;
}

const czk = (x: number) =>
  x.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' Kč';
const kwh = (x: number) => x.toLocaleString('cs-CZ', { maximumFractionDigits: 1 }) + ' kWh';

// Returns (or creates) the record for the current period.
function currentRecord(): MonthlyRecord {
  let rec = state.records.find((x) => x.period === currentPeriod);
  if (!rec) {
    rec = {
      period: currentPeriod,
      meter: { production: 0, houseConsumption: 0, feedIn: 0, gridPurchase: 0 },
      readings: state.agreement.flats.map((f) => ({ id: f.id, peak: 0, offPeak: 0 })),
      // Freeze the current tariff for this month — later tariff edits must not
      // rewrite already issued bills.
      tariff: structuredClone(state.tariff),
      readingDate: new Date().toISOString().slice(0, 10),
    };
    state.records.push(rec);
    state.records.sort((a, b) => a.period.localeCompare(b.period));
  }
  // Ensure readings exist for all flats.
  for (const f of state.agreement.flats) {
    if (!rec.readings.find((r) => r.id === f.id)) rec.readings.push({ id: f.id, peak: 0, offPeak: 0 });
  }
  return rec;
}

function save() {
  persist();
  render();
}

function numInput(value: number, onChange: (v: number) => void, extra = ''): HTMLInputElement {
  const i = document.createElement('input');
  i.type = 'number';
  i.inputMode = 'decimal'; // numeric keyboard on phones
  // Empty field instead of a pre-filled 0 — no zero to delete before typing.
  i.value = value === 0 ? '' : String(value);
  i.placeholder = '0';
  i.className =
    'w-full rounded-md border border-slate-300 px-3 py-2 text-right tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 ' +
    extra;
  // Průběžně jen zapisuj do stavu a localStorage; celou stránku překresli až
  // po opuštění pole — render() maže DOM a ukradl by fokus uprostřed psaní.
  i.addEventListener('input', () => {
    onChange(parseFloat(i.value) || 0);
    persist();
  });
  i.addEventListener('change', render);
  // Tapping a filled field selects its content, so typing replaces the value.
  i.addEventListener('focus', () => i.select());
  return i;
}

function render() {
  const app = document.getElementById('app')!;
  app.innerHTML = '';

  if (helpMode) {
    app.append(renderHelp());
    return;
  }
  if (wizardStep !== null) {
    app.append(renderWizard());
    return;
  }

  const rec = currentRecord();
  const prev = previousRecord(state.records, currentPeriod);
  const flatConsumption = consumptionFromReadings(rec.readings, prev?.readings);
  const result = calculateBilling(rec.meter, flatConsumption, rec.tariff, state.agreement);

  const wrap = el('div', 'mx-auto max-w-4xl px-4 py-8 space-y-6');

  // Header (hidden in print — the printout gets its own clean heading below)
  const headerRow = el('header', 'flex items-start justify-between gap-3 print:hidden');
  headerRow.append(
    el('div', 'space-y-1', [
      el('h1', 'text-2xl font-bold text-slate-900', '☀️ FVE rozúčet'),
      el('p', 'text-sm text-slate-500', 'Rozúčtování elektřiny z FVE mezi 3 byty. Data jen v tomto prohlížeči.'),
    ]),
    btn('📖 Návod', 'bg-slate-200 text-slate-700 hover:bg-slate-300 shrink-0', () => {
      helpMode = true;
      render();
    })
  );
  wrap.append(headerRow);

  // Print-only heading, so the PDF for a tenant reads like a statement.
  wrap.append(
    el('div', 'hidden print:block space-y-1', [
      el('h1', 'text-xl font-bold text-slate-900', `Vyúčtování elektřiny — ${periodLabel(currentPeriod)}`),
      el('p', 'text-xs text-slate-500',
        (rec.readingDate ? `Odečet podružek: ${new Date(rec.readingDate).toLocaleDateString('cs-CZ')} · ` : '') +
          `Vygenerováno ${new Date().toLocaleDateString('cs-CZ')} · FVE rozúčet`),
    ])
  );

  if (demoMode) wrap.append(demoCard());

  const hasAnyData = state.records.some(
    (r) =>
      r.meter.production || r.meter.houseConsumption || r.meter.feedIn || r.meter.gridPurchase ||
      r.readings.some((x) => x.peak || x.offPeak)
  );

  // First run: nothing entered yet → point to the demo and the wizard.
  if (!demoMode && !hasAnyData) {
    const welcome = el('section', 'rounded-lg border-2 border-emerald-300 bg-emerald-50 p-5 space-y-3 print:hidden');
    const btnRow = el('div', 'flex gap-3 flex-wrap');
    btnRow.append(
      btn('🎬 Prohlédnout ukázku', 'bg-sky-600 text-white hover:bg-sky-700', enterDemo),
      btn('🧭 Začít první odečet', 'bg-emerald-600 text-white hover:bg-emerald-700', () => {
        wizardStep = 0;
        render();
      })
    );
    welcome.append(
      el('h2', 'font-semibold text-emerald-900', '👋 Vítej — vypadá to, že začínáš'),
      el('p', 'text-sm text-emerald-900', 'Tahle appka jednou měsíčně spočítá z 10 opsaných čísel, kolik má který byt zaplatit za elektřinu. Nejlepší první krok: prohlédni si ukázku s reálnými čísly z faktury, nebo se rovnou pusť do prvního odečtu — průvodce tě povede. Podrobnosti najdeš kdykoli pod 📖 Návod vpravo nahoře.'),
      btnRow
    );
    wrap.append(welcome);
  }

  // Backup nudge: data exists but the last JSON export is old or missing.
  if (!demoMode && hasAnyData) {
    const last = localStorage.getItem(EXPORT_KEY);
    const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
    if (days === null || days > 31) {
      const strip = el('section', 'flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 print:hidden');
      strip.append(
        el('p', 'text-sm text-amber-800', days === null
          ? '💾 Zálohu sis ještě nikdy nestáhl — data žijí jen v tomto prohlížeči a smazáním „dat webů“ by zmizela.'
          : `💾 Poslední záloha je ${days} dní stará — stáhni si aktuální.`),
        btn('⬇️ Zálohovat teď', 'bg-amber-600 text-white hover:bg-amber-700', downloadExport)
      );
      wrap.append(strip);
    }
  }

  // Period selector
  const periodRow = el('div', 'flex items-center gap-3 flex-wrap');
  const sel = document.createElement('select');
  sel.className = 'rounded-md border border-slate-300 px-3 py-2';
  const periods = [...new Set([currentPeriod, ...state.records.map((x) => x.period)])].sort();
  for (const p of periods) {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = periodLabel(p);
    if (p === currentPeriod) opt.selected = true;
    sel.append(opt);
  }
  sel.addEventListener('change', () => {
    currentPeriod = sel.value;
    render();
  });
  const newBtn = btn('+ Nový měsíc', 'bg-slate-200 text-slate-700 hover:bg-slate-300', () => {
    // The common case is always "the month after the newest one" — one click,
    // human-readable. Any other period can be picked in the wizard.
    const p = state.records.length
      ? nextPeriod(state.records[state.records.length - 1].period)
      : prevPeriod(currentPeriod); // first-ever month = baseline for last month
    if (confirm(`Založit nový měsíc: ${periodLabel(p)}?\n\n(Jiné období jde založit přes 🧭 Průvodce měsícem.)`)) {
      currentPeriod = p;
      currentRecord();
      save();
    }
  });
  const wizardBtn = btn('🧭 Průvodce měsícem', 'bg-emerald-600 text-white hover:bg-emerald-700', () => {
    wizardStep = 0;
    render();
  });
  const delBtn = btn('🗑️ Smazat měsíc', 'bg-red-50 text-red-700 hover:bg-red-100', () => {
    const msg =
      `Opravdu smazat měsíc ${periodLabel(currentPeriod)} včetně všech jeho odečtů?\n\n` +
      'Spotřeba následujícího měsíce se pak spočítá proti nejbližšímu staršímu zadanému měsíci. ' +
      'Akce nejde vrátit — pokud si nejsi jistý, udělej nejdřív Export JSON.';
    if (!confirm(msg)) return;
    state.records = state.records.filter((r) => r.period !== currentPeriod);
    currentPeriod = lastOrNewPeriod();
    save();
  });
  periodRow.append(label('Období:'), sel, newBtn, wizardBtn, delBtn);
  if (!demoMode) {
    periodRow.append(
      btn('🎬 Ukázka', 'bg-sky-100 text-sky-700 hover:bg-sky-200', enterDemo)
    );
  }
  wrap.append(noPrint(card('Měsíc', [periodRow], undefined, `
    <p>Vyúčtování se dělá po kalendářních měsících. <strong>🧭 Průvodce měsícem</strong> tě zadáním
    provede krok za krokem — pro začátek nejjistější cesta. <strong>+ Nový měsíc</strong> založí
    období ručně, rozbalovací nabídkou se vracíš k už zadaným měsícům a <strong>🗑️</strong> smaže
    jen ten zobrazený.</p>
    <p>Úplně první kolo je „nultý odečet“: zapíšou se počáteční stavy podružek a první rozpis
    plateb bude až od dalšího měsíce. Odečty pak dělej ideálně vždy 1. den v měsíci.</p>
  `)));

  // Meter (SEMS) inputs
  const semsChildren: Node[] = prev ? [meterGridEl(rec)] : [baselineSemsNote(), meterGridEl(rec)];
  wrap.append(noPrint(card('Data ze SEMS+ (celý dům)', semsChildren, 'Z aplikace nebo portálu SEMS Portal (GoodWe). Přihlášení účtem k FVE. Hodnoty ber za daný kalendářní měsíc z měsíčního přehledu/statistik.', `
    <ol class="list-decimal space-y-1 pl-5">
      <li>Otevři aplikaci <strong>SEMS+</strong> (nebo semsportal.com) a přihlas se účtem k FVE.</li>
      <li>Jdi do <strong>Statistiky → měsíční přehled</strong> a vyber měsíc, který zadáváš.</li>
      <li>Opiš 4 čísla v kWh: <strong>Výroba</strong>, <strong>Spotřeba</strong> (Zatížení),
        <strong>Do sítě</strong> (Prodej) a <strong>Ze sítě</strong> (Nákup).</li>
    </ol>
    <p>„Ze sítě“ by mělo zhruba odpovídat součtu VT+NT na faktuře innogy — tím si ověříš,
    že koukáš na správný měsíc.</p>
  `)));

  // Submeter readings
  wrap.append(noPrint(card('Stavy podružek (z displeje CIT 372L)', [readingsBoxEl(rec, prev)], 'Fyzický odečet z displejů 3 podružek v rozvaděči (1.N.P, 2.N.P, 3.N.P). Tlačítkem na měřidle přepneš mezi T1 (VT) a T2 (NT). Opisuj stav vždy ke stejnému dni v měsíci.', `
    <p>V rozvaděči jsou tři elektroměry <strong>CIT 372L</strong> — každý měří jeden byt
    (1.N.P, 2.N.P, 3.N.P).</p>
    <ol class="list-decimal space-y-1 pl-5">
      <li>Tlačítkem na měřidle přepínáš displej: <strong>T1</strong> = vysoký tarif (VT),
        <strong>T2</strong> = nízký tarif (NT).</li>
      <li>Opiš oba stavy pro každý byt — celkem 6 čísel.</li>
    </ol>
    <p><strong>Zadávej STAV měřidla</strong> (velké číslo, které jen roste), <strong>ne
    spotřebu</strong> — rozdíl proti minulému měsíci spočítá appka sama. Pod každým polem
    vidíš pro kontrolu stav z minulého měsíce: nové číslo musí být vždy stejné nebo vyšší.</p>
    <p>Vyplň i <strong>datum odečtu</strong> — zdokumentuje, ke kterému dni stavy platí,
    a tiskne se na vyúčtování.</p>
  `)));

  // Data checks — warn on inconsistent inputs before showing the result.
  const warnings = collectWarnings(rec, prev, flatConsumption);
  if (warnings.length) wrap.append(noPrint(warningsCardEl(warnings)));

  // Result — months without a previous reading have nothing to bill; showing
  // the table (with fixed charges only) would look like a real statement.
  if (prev) {
    wrap.append(resultCard(result));
  } else {
    wrap.append(
      el('section', 'rounded-lg border border-slate-200 bg-white p-5 space-y-2 text-sm text-slate-600', [
        el('h2', 'font-semibold text-slate-900', 'Rozpis na byt'),
        el('p', '', `${periodLabel(rec.period)} je nultý odečet — drží jen počáteční stavy podružek. Vyúčtování se objeví u následujícího měsíce, až bude s čím porovnávat.`),
      ])
    );
  }

  // Feed-in, grouped by the buyback settlement year (1 Nov → 31 Oct).
  // Priced by each month's own tariff — the buyback price can change over time.
  const byYear = new Map<string, { kwh: number; revenue: number }>();
  for (const r of state.records) {
    const y = billingYear(r.period);
    const e = byYear.get(y) ?? { kwh: 0, revenue: 0 };
    e.kwh += r.meter.feedIn || 0;
    e.revenue += ((r.meter.feedIn || 0) / 1000) * r.tariff.feedInMWh;
    byYear.set(y, e);
  }
  const feedInBox = el('div', 'space-y-2 text-sm');
  for (const [year, sums] of [...byYear.entries()].sort()) {
    const payouts = splitPvShares(sums.revenue, state.agreement);
    const line = Object.entries(payouts)
      .map(([id, amount]) => `${state.agreement.flats.find((f) => f.id === id)?.name ?? id}: ${czk(amount)}`)
      .join(' · ');
    feedInBox.append(
      el('p', '', `Zúčtovací rok ${year}: ${kwh(sums.kwh)} → ${czk(sums.revenue)} (dle výkupní ceny jednotlivých měsíců)`),
      el('p', 'text-slate-600 pl-4', line)
    );
  }
  feedInBox.append(el('p', 'text-xs text-slate-400', 'Innogy výkup zúčtovává a vyplácí 1× ročně za období 1. 11. → 31. 10. Tady se přetoky jen průběžně sčítají ze zadaných měsíců — konečné číslo porovnej s ročním vyúčtováním výkupu.'));
  wrap.append(noPrint(card('Přetoky — výplata vlastníkům FVE', [feedInBox], 'Peníze za elektřinu prodanou do sítě. Nesouvisí s měsíčními platbami bytů — dělí se jen mezi vlastníky FVE podle podílů.', `
    <p>Tohle jsou <strong>peníze navíc</strong>, oddělené od plateb bytů: co dům neprodal sám sobě,
    prodal do sítě. Patří jen vlastníkům FVE (Byt 1 + Byt 2, 50/50).</p>
    <p>Innogy výkup vyplácí <strong>jednou ročně</strong> za období 1. 11. → 31. 10. — tady se
    přetoky jen průběžně sčítají, ať víš, kolik zhruba čekat. Po ročním vyúčtování od innogy
    čísla porovnej. Výkup běží až od 14. 5. 2026; starší přetoky se neproplácejí.</p>
  `)));

  // Settings (tariff + agreement) — collapsible
  wrap.append(noPrint(settingsCard(rec)));

  // Export / import — hidden in demo (exporting sample data or wiping real
  // localStorage from inside the demo would only confuse).
  if (!demoMode) wrap.append(noPrint(exportCard()));

  app.append(wrap);
}

// === shared input blocks (used by the main view and the wizard) ===

// Shown with the SEMS inputs when the displayed month is the baseline reading:
// its SEMS numbers are not used for billing (only feed-in counts, yearly).
function baselineSemsNote(): HTMLElement {
  return el(
    'p',
    'rounded-md bg-amber-50 p-3 text-xs leading-relaxed text-amber-800',
    'Tohle je nultý odečet — z tohoto měsíce appka použije jen stavy podružek, ' +
      'vyúčtování za něj nevzniká. Čísla ze SEMS+ můžeš nechat prázdná. Jediná výjimka: ' +
      '„Přetoky do sítě“ se počítají do ročního součtu výkupu — vyplň je, pokud už běží ' +
      'výkup a chceš mít roční přehled přetoků kompletní.'
  );
}

function meterGridEl(rec: MonthlyRecord): HTMLElement {
  const meterGrid = el('div', 'grid grid-cols-2 gap-4 sm:grid-cols-4');
  const meterFields: { key: keyof MeterData; label: string; hint: string }[] = [
    {
      key: 'production',
      label: 'Výroba FVE',
      hint: 'SEMS+ → Statistiky → měsíční přehled → „Výroba“ (energie z panelů za daný měsíc).',
    },
    {
      key: 'houseConsumption',
      label: 'Spotřeba domu',
      hint: 'SEMS+ → Statistiky → měsíční přehled → „Spotřeba“ / „Zatížení“ (celková spotřeba domu za měsíc).',
    },
    {
      key: 'feedIn',
      label: 'Přetoky do sítě',
      hint: 'SEMS+ → Statistiky → „Do sítě“ / „Prodej“ (energie odeslaná do sítě). Lze ověřit i z hlavního elektroměru, registr 2.8.0.',
    },
    {
      key: 'gridPurchase',
      label: 'Nákup ze sítě',
      hint: 'SEMS+ → Statistiky → „Ze sítě“ / „Nákup“ (energie odebraná ze sítě). Odpovídá VT+NT na faktuře innogy.',
    },
  ];
  for (const f of meterFields) {
    // justify-end bottom-aligns the inputs — labels wrap to 1 or 2 lines,
    // which would otherwise push the single-line fields up.
    const field = el('div', 'flex flex-col justify-end gap-1');
    field.append(label(f.label + ' [kWh]', f.hint));
    field.append(numInput(rec.meter[f.key], (v) => { rec.meter[f.key] = v; }));
    meterGrid.append(field);
  }
  return meterGrid;
}

function readingsBoxEl(rec: MonthlyRecord, prev: MonthlyRecord | undefined): HTMLElement {
  const readingsBox = el('div', 'space-y-3');
  const hdr = el('div', 'grid grid-cols-3 gap-3 text-xs font-medium text-slate-500');
  const peakHdr = el('div', 'flex items-center justify-end gap-1');
  peakHdr.append(
    el('span', '', 'Stav VT (T1)'),
    infoButton('Aktuální stav vysokého tarifu z displeje podružky CIT 372L (registr T1). Přepíná se tlačítkem na měřidle. Zadej stav, ne spotřebu — appka spočítá rozdíl proti minulému měsíci.')
  );
  const offPeakHdr = el('div', 'flex items-center justify-end gap-1');
  offPeakHdr.append(
    el('span', '', 'Stav NT (T2)'),
    infoButton('Aktuální stav nízkého tarifu z displeje podružky CIT 372L (registr T2). U sazby D57d je NT většina dne.')
  );
  hdr.append(el('div', '', 'Byt'), peakHdr, offPeakHdr);
  readingsBox.append(hdr);
  const cell = (value: number, onChange: (v: number) => void, prevVal?: number): HTMLElement => {
    const d = el('div', 'space-y-0.5');
    d.append(numInput(value, onChange));
    if (prevVal !== undefined)
      d.append(el('div', 'text-right text-[11px] text-slate-400', `minule ${prevVal.toLocaleString('cs-CZ')}`));
    return d;
  };
  for (const f of state.agreement.flats) {
    const r = rec.readings.find((x) => x.id === f.id)!;
    const p = prev?.readings.find((x) => x.id === f.id);
    const row = el('div', 'grid grid-cols-3 gap-3 items-start');
    row.append(el('div', 'text-sm pt-2', f.name));
    row.append(cell(r.peak, (v) => { r.peak = v; }, p?.peak));
    row.append(cell(r.offPeak, (v) => { r.offPeak = v; }, p?.offPeak));
    readingsBox.append(row);
  }
  const dateRow = el('div', 'flex flex-wrap items-center gap-2 pt-1');
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = rec.readingDate ?? '';
  dateInput.className = 'rounded-md border border-slate-300 px-3 py-1.5 text-sm';
  dateInput.addEventListener('change', () => {
    rec.readingDate = dateInput.value || undefined;
    persist();
  });
  dateRow.append(
    label('Datum odečtu', 'Den, kdy jsi stavy skutečně opsal z displejů. Ideálně 1. den měsíce — pak se odečet kryje s měsíčními čísly ze SEMS+. Datum se ukládá k měsíci a tiskne na vyúčtování.'),
    dateInput
  );
  readingsBox.append(dateRow);

  const note = prev
    ? el('p', 'text-xs text-slate-400', `Spotřeba se počítá jako rozdíl oproti období ${periodLabel(prev.period)}.`)
    : el('p', 'text-xs text-amber-600', 'První (nultý) odečet — jen se zapíšou počáteční stavy, vyúčtování bude až od příštího měsíce.');
  readingsBox.append(note);
  return readingsBox;
}

function collectWarnings(
  rec: MonthlyRecord,
  prev: MonthlyRecord | undefined,
  flatConsumption: { id: string; peak: number; offPeak: number }[]
): string[] {
  const warnings = checkConsistency(rec.meter, flatConsumption);
  if (prev) {
    for (const f of state.agreement.flats) {
      const cur = rec.readings.find((x) => x.id === f.id)!;
      const p = prev.readings.find((x) => x.id === f.id);
      if (!p) continue;
      if ((cur.peak > 0 && cur.peak < p.peak) || (cur.offPeak > 0 && cur.offPeak < p.offPeak)) {
        warnings.push(
          `${f.name}: zadaný stav je NIŽŠÍ než v období ${periodLabel(prev.period)}. Stav elektroměru jen roste — ` +
            `nejspíš překlep. Spotřeba bytu se zatím počítá jako 0.`
        );
      }
    }
  }
  return warnings;
}

function warningsCardEl(warnings: string[]): HTMLElement {
  const list = el('ul', 'list-disc space-y-1 pl-5 text-sm text-amber-800');
  for (const w of warnings) list.append(el('li', '', w));
  const c = el('section', 'rounded-lg border border-amber-300 bg-amber-50 p-5 space-y-3');
  c.append(el('h2', 'font-semibold text-amber-900', '⚠️ Kontrola dat — něco nesedí'), list);
  return c;
}

function resultCard(r: ReturnType<typeof calculateBilling>) {
  const box = el('div', 'space-y-4');

  const summary = el('div', 'flex gap-4 flex-wrap text-sm');
  summary.append(
    pill('FVE pokrytí', kwh(r.pvKwh), 'bg-emerald-50 text-emerald-700'),
    pill('Společná spotřeba', kwh(r.commonKwh), 'bg-amber-50 text-amber-700'),
    pill('FVE úspora celkem', czk(r.totalSavings), 'bg-emerald-50 text-emerald-700')
  );
  box.append(summary);

  const tbl = document.createElement('table');
  tbl.className = 'w-full text-sm';
  tbl.innerHTML = `
    <thead>
      <tr class="border-b border-slate-200 text-xs text-slate-500">
        <th class="py-2 text-left">Byt</th>
        <th class="text-right">Spotřeba</th>
        <th class="text-right">Síť</th>
        <th class="text-right">− FVE bonus</th>
        <th class="text-right">+ Společná</th>
        <th class="text-right">+ Fix</th>
        <th class="text-right font-semibold">= Platba</th>
      </tr>
    </thead>`;
  const tb = document.createElement('tbody');
  for (const row of r.rows) {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-100';
    tr.innerHTML = `
      <td class="py-2">${row.name}</td>
      <td class="text-right tabular-nums">${kwh(row.consumption)}</td>
      <td class="text-right tabular-nums">${czk(row.gridCost)}</td>
      <td class="text-right tabular-nums text-emerald-600">${row.pvBonus ? '−' + czk(row.pvBonus) : '—'}</td>
      <td class="text-right tabular-nums">${czk(row.common)}</td>
      <td class="text-right tabular-nums">${czk(row.fixed)}</td>
      <td class="text-right tabular-nums font-semibold text-slate-900">${czk(row.total)}</td>`;
    tb.append(tr);
  }
  const trSum = document.createElement('tr');
  trSum.className = 'font-semibold';
  trSum.innerHTML = `<td class="py-2" colspan="6">Celkem</td><td class="text-right tabular-nums">${czk(r.grandTotal)}</td>`;
  tb.append(trSum);
  tbl.append(tb);
  // 7 columns don't fit a phone screen — let the table scroll sideways.
  const scroll = el('div', 'overflow-x-auto');
  scroll.append(tbl);
  box.append(scroll);

  return card('Rozpis na byt (s DPH)', [box], undefined, `
    <ul class="list-disc space-y-1 pl-5">
      <li><strong>Síť</strong> — kolik by spotřeba bytu stála, kdyby se všechno kupovalo ze sítě
        za ceny z faktury (= kdyby FVE nebyla).</li>
      <li><strong>− FVE bonus</strong> — sleva ze solární úspory. Dostávají ji jen vlastníci FVE
        (Byt 1 + Byt 2, každý polovinu).</li>
      <li><strong>+ Společná</strong> — třetina spotřeby společných prostor (chodby, čerpadlo,
        studna, akvárium…), které nemají vlastní elektroměr.</li>
      <li><strong>+ Fix</strong> — třetina stálých měsíčních plateb z faktury. Platí se i při
        nulové spotřebě — je to cena za přípojku.</li>
      <li><strong>= Platba</strong> — výsledná částka za měsíc, včetně DPH.</li>
    </ul>
    <p><strong>Proč Byt 3 slevu nedostává?</strong> Není vlastník FVE — platí plnou cenu a hodnota
    solární elektřiny, kterou spotřeboval, připadá vlastníkům. Tak se jim vrací investice.</p>
    <p>Součet plateb vyjde o ~1 % jinak než faktura innogy — to je v pořádku, appka oceňuje
    solární elektřinu průměrnou cenou VT/NT.</p>
  `);
}

function settingsCard(rec: MonthlyRecord) {
  const det = document.createElement('details');
  det.className = 'rounded-lg border border-slate-200 bg-white p-5';
  trackOpen(det, 'settings');
  const sum = document.createElement('summary');
  sum.className = 'cursor-pointer font-semibold text-slate-900';
  sum.textContent = 'Nastavení — ceník a dohoda';
  det.append(sum);

  det.append(el('div', 'mt-3', [helpDetails(`
    <p><strong>Sem není potřeba sahat.</strong> Všechny hodnoty jsou opsané ze skutečných
    smluv a z faktury innogy za duben 2026 — dokud se nezmění smlouva nebo regulované ceny
    (ty se mění obvykle k 1. lednu), sedí a nech je být.</p>
    <p>Měnit je budeš, až přijde faktura s jinými cenami: přepiš hodnoty podle ní,
    <strong>vždy bez DPH</strong>. Změna platí jen pro nově založené měsíce — už zadaná
    vyúčtování mají ceník zamrzlý, takže se zpětně nic nepřepočítá.</p>
    <p>U každého pole je ⓘ s vysvětlením, co to je a kde to na faktuře najdeš.
    <strong>Dohoda</strong> (kdo vlastní FVE a jak se co dělí) se tu jen zobrazuje —
    mění se úpravou JSON zálohy, aby ji nešlo rozhodit omylem.</p>
  `)]));

  // Each month keeps its own frozen tariff; this shows what the displayed
  // month actually bills with.
  const prices = pricesPerMWh(rec.tariff);
  const info = el('div', 'mt-4 space-y-1 text-sm text-slate-600');
  info.append(
    el('p', 'font-medium text-slate-900', `Ceník pro ${periodLabel(rec.period)} (podle něj se počítá tabulka výše)`),
    el('p', '', `Cena VT: ${(prices.peak / 1000).toFixed(2)} Kč/kWh · NT: ${(prices.offPeak / 1000).toFixed(2)} Kč/kWh · fixy: ${prices.fixedTotalMonth.toFixed(2)} Kč/měs (bez DPH)`),
    el('p', '', `Sleva ze silové: ${rec.tariff.discountPct} % · DPH: ${rec.tariff.vatPct} % · výkup: ${rec.tariff.feedInMWh} Kč/MWh`)
  );
  det.append(info);

  const tariffFields: { key: keyof typeof state.tariff; label: string; hint: string }[] = [
    { key: 'energyMWh', label: 'Silová [Kč/MWh]', hint: 'Cena silové elektřiny z ceníku innogy (Optimal 36), bez DPH. Na faktuře v části „Dodávka“ — VT i NT mají stejnou cenu, sleva se zadává zvlášť vedle.' },
    { key: 'discountPct', label: 'Sleva [%]', hint: 'Individuální sleva ze silové elektřiny sjednaná ve smlouvě (od 1. 1. 2026 je 15 %). Neplatí pro stálé měsíční platy.' },
    { key: 'distPeakMWh', label: 'Distribuce VT', hint: 'Regulovaná cena za distribuci ve vysokém tarifu (sazba D57d, EG.D), Kč/MWh. Na faktuře v části „Distribuce“. Mění se obvykle k 1. lednu.' },
    { key: 'distOffPeakMWh', label: 'Distribuce NT', hint: 'Regulovaná cena za distribuci v nízkém tarifu, Kč/MWh. U D57d je NT výrazně levnější než VT — právě tohle dělá rozdíl mezi cenou VT a NT kWh.' },
    { key: 'systemMWh', label: 'Systémové služby', hint: 'Regulovaný poplatek za systémové služby (stabilita sítě), Kč/MWh. Na faktuře v části „Související služby“.' },
    { key: 'taxMWh', label: 'Daň z elektřiny', hint: 'Spotřební daň z elektřiny daná zákonem, Kč/MWh. Platí se z každé odebrané kWh.' },
    { key: 'fixedSupplyMonth', label: 'Fix dodávka [Kč/měs]', hint: 'Stálý měsíční plat dodavateli (innogy). Nezávisí na spotřebě — platí se, i kdyby dům nic neodebral.' },
    { key: 'fixedDistributionMonth', label: 'Fix distribuce', hint: 'Stálý měsíční plat za distribuci podle velikosti hlavního jističe (3×40 A), Kč/měs. Regulovaná položka.' },
    { key: 'fixedOffgridMonth', label: 'Fix nesíťová', hint: 'Poplatek za provoz nesíťové infrastruktury, Kč/měs. Regulovaná drobnost (řád jednotek korun).' },
    { key: 'feedInMWh', label: 'Výkup [Kč/MWh]', hint: 'Výkupní cena přetoků podle smlouvy „innogy Výkup“ — jednotná pro VT i NT. Innogy ji může měnit svým ceníkem výkupu, tak ji občas zkontroluj.' },
    { key: 'vatPct', label: 'DPH [%]', hint: 'Sazba DPH. Celý ceník se zadává bez DPH — appka ji přičítá až na konci výpočtu.' },
  ];

  const diffs = tariffFields.filter((f) => rec.tariff[f.key] !== state.tariff[f.key]);
  if (diffs.length) {
    const fmt = (x: number) => x.toLocaleString('cs-CZ');
    const diffBox = el('div', 'mt-3 space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800');
    const list = el('ul', 'list-disc pl-5 space-y-0.5');
    for (const f of diffs) {
      list.append(el('li', '', `${f.label}: měsíc má ${fmt(rec.tariff[f.key])}, aktuální ceník dole ${fmt(state.tariff[f.key])}`));
    }
    diffBox.append(
      el('p', '', `Ceník uložený u měsíce ${periodLabel(rec.period)} se liší od aktuálního ceníku dole:`),
      list,
      el('p', '', 'To je správně, pokud se ceny mezitím opravdu změnily — historie zůstává, jak byla vyúčtována. Pokud ses ale v polích dole jen přepsal, vrať je zpátky druhým tlačítkem.'),
      el('div', 'flex flex-wrap gap-2', [
        btn(`Přepsat ceník měsíce ${periodLabel(rec.period)} hodnotami zdola`, 'bg-amber-600 text-white hover:bg-amber-700', () => {
          rec.tariff = structuredClone(state.tariff);
          save();
        }),
        btn('↩ Vrátit aktuální ceník na hodnoty tohoto měsíce', 'bg-white border border-amber-400 text-amber-800 hover:bg-amber-100', () => {
          state.tariff = structuredClone(rec.tariff);
          save();
        }),
      ])
    );
    det.append(diffBox);
  }

  // The agreement itself is not editable in the UI (on purpose — it changes
  // rarely and a mis-click would silently skew every bill). Show it read-only.
  const ag = state.agreement;
  const owners = ag.flats.filter((f) => f.pvOwner);
  const shareList = (shares: Record<string, number>) =>
    ag.flats.map((f) => `${f.name} ${shares[f.id] ?? 0}`).join(' : ');
  const agBox = el('div', 'mt-4 space-y-1 rounded-md bg-slate-50 p-3 text-sm text-slate-600');
  agBox.append(
    el('div', 'font-medium text-slate-900', 'Dohoda mezi byty (podle které se počítá)'),
    el('p', '', `Vlastníci FVE: ${owners.map((f) => `${f.name} (${ag.pvShares[f.id] ?? 0} %)`).join(' + ')} — jen oni dostávají FVE bonus a výplatu za přetoky.`),
    el('p', '', `Fixní měsíční platby v poměru — ${shareList(ag.fixedShares)}.`),
    el('p', '', `Společná spotřeba (chodby, čerpadlo, studna…) v poměru — ${shareList(ag.commonShares)}.`),
    el('p', 'text-xs text-slate-400', 'Změna dohody zatím jen ručně: Export JSON → upravit sekci „agreement“ → Import JSON. Podrobně v NAVOD.md.')
  );
  det.append(agBox);

  det.append(
    el('h3', 'mt-4 text-sm font-medium text-slate-900', 'Aktuální ceník — použije se pro nově založené měsíce'),
    el('p', 'text-xs text-slate-400', 'Přednastaveno z faktury innogy 04/2026 a smlouvy (Optimal 36, D57d, sleva 15 %). Dokud se smlouva nebo regulované ceny nezmění, není potřeba nic měnit. Hodnoty vždy bez DPH; už zadané měsíce mají ceník zamrzlý.')
  );
  const grid = el('div', 'mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3');
  for (const f of tariffFields) {
    const field = el('div', 'flex flex-col justify-end gap-1');
    field.append(label(f.label, f.hint));
    field.append(numInput(state.tariff[f.key], (val) => { state.tariff[f.key] = val; }));
    grid.append(field);
  }
  det.append(grid);

  return det;
}

// === in-app user guide ===
// Same content as NAVOD.md, but reachable from the UI — the audience won't
// open a markdown file. Static trusted text, so innerHTML is fine here.
function helpSection(title: string, html: string, open = false): HTMLElement {
  const det = document.createElement('details');
  det.className = 'rounded-lg border border-slate-200 bg-white p-5';
  det.open = open;
  const sum = document.createElement('summary');
  sum.className = 'cursor-pointer font-semibold text-slate-900';
  sum.textContent = title;
  const body = el('div', 'mt-3 space-y-2 text-sm leading-relaxed text-slate-600');
  body.innerHTML = html;
  det.append(sum, body);
  return det;
}

function renderHelp(): HTMLElement {
  const wrap = el('div', 'mx-auto max-w-3xl px-4 py-8 space-y-4');
  const backBtn = () =>
    btn('← Zpět do appky', 'bg-slate-200 text-slate-700 hover:bg-slate-300', () => {
      helpMode = false;
      render();
    });

  const headerRow = el('header', 'flex items-start justify-between gap-3');
  headerRow.append(
    el('div', 'space-y-1', [
      el('h1', 'text-2xl font-bold text-slate-900', '📖 Návod k použití'),
      el('p', 'text-sm text-slate-500', 'Co kam zadat, odkud čísla vzít a jak číst výsledek. Klikni na kapitolu.'),
    ]),
    backBtn()
  );
  wrap.append(headerRow);

  wrap.append(helpSection('Co tahle appka dělá', `
    <p>Jednou měsíčně do ní opíšeš <strong>10 čísel</strong> — 4 z aplikace SEMS+ a 6 z elektroměrů
    v rozvaděči — a ona spočítá, <strong>kolik má který byt zaplatit za elektřinu</strong>. Férově
    zohledňuje, že fotovoltaiku vlastní jen Byt 1 a Byt 2.</p>
    <p><strong>Důležité:</strong> všechna data jsou uložená jen v tomto prohlížeči na tomto počítači.
    Nikam se neposílají — proto si po každém měsíci stáhni zálohu (tlačítko Export JSON).</p>
    <p>Chceš si to nejdřív jen prohlédnout? Klikni na <strong>🎬 Ukázka</strong> — appka se naplní
    reálnými čísly z dubnové faktury a modrý panel vysvětlí, co které číslo znamená. Nic se
    při tom neukládá.</p>
  `, true));

  wrap.append(helpSection('Měsíční rutina (5 kroků, ~10 minut)', `
    <p><strong>Nejjednodušší je kliknout na 🧭 Průvodce měsícem</strong> — provede tě vším sám.
    Kroky jsou tyhle:</p>
    <ol class="list-decimal space-y-1 pl-5">
      <li><strong>Založ nový měsíc</strong> (formát 2026-07 = červenec).</li>
      <li><strong>Opiš 4 čísla ze SEMS+</strong> (aplikace/portál GoodWe, přihlášení účtem k FVE):
        Statistiky → měsíční přehled → Výroba, Spotřeba, Do sítě, Ze sítě. Vše v kWh.</li>
      <li><strong>Opiš 6 stavů z podružek</strong> — v rozvaděči jsou 3 elektroměry CIT 372L
        (jeden na byt). Tlačítkem na měřidle přepínáš displej mezi T1 (VT) a T2 (NT).
        <strong>Zadávej STAV měřidla (velké kumulativní číslo), ne spotřebu</strong> — rozdíl proti
        minulému měsíci si appka spočítá sama.</li>
      <li><strong>Mrkni, jestli nesvítí žlutý panel „Kontrola dat“</strong> — appka porovnává čísla
        mezi sebou a upozorní na překlepy.</li>
      <li><strong>Přečti tabulku, případně vytiskni (Tisk / PDF) a stáhni zálohu.</strong></li>
    </ol>
    <p>Odečty dělej vždy ke stejnému dni — ideálně 1. den v měsíci ráno.</p>
  `));

  wrap.append(helpSection('První použití — a kdy vůbec začít', `
    <p>První kolo je <strong>„nultý odečet“</strong>: zapíšou se počáteční stavy podružek, ale
    vyúčtování ještě nevznikne — není s čím porovnávat. První skutečný rozpis uvidíš až
    u druhého zadaného měsíce.</p>
    <p><strong>Začít můžeš kterýkoli den — nic se nerozbije.</strong> Jediný háček: první vyúčtovaný
    měsíc bude mírně nepřesný. SEMS+ počítá celé kalendářní měsíce, ale podružky měří až od
    tvého prvního odečtu — spotřeba bytů od 1. dne měsíce do dne odečtu se tak rozpustí do
    společné spotřeby (dělené na třetiny). Je to jednorázová drobnost; od druhého měsíce už
    čísla sedí přesně.</p>
    <p><strong>Do budoucna odečítej vždy k 1. dni měsíce</strong>, ať se stavy podružek kryjí
    s měsíčními čísly ze SEMS+. Kdo chce úplně čistý start, udělá nultý odečet kdykoli a ostré
    účtování začne od nejbližšího 1. dne.</p>
  `));

  wrap.append(helpSection('Jak číst tabulku „Rozpis na byt“', `
    <ul class="list-disc space-y-1 pl-5">
      <li><strong>Spotřeba</strong> — co byt reálně spotřeboval podle své podružky (VT + NT).</li>
      <li><strong>Síť</strong> — kolik by ta spotřeba stála, kdyby se všechno kupovalo ze sítě
        za ceny z faktury.</li>
      <li><strong>− FVE bonus</strong> — sleva za elektřinu ze slunce/baterie. Dostávají ji jen
        vlastníci FVE (Byt 1 + Byt 2, každý polovinu).</li>
      <li><strong>+ Společná</strong> — podíl bytu (⅓) na spotřebě společných prostor: chodby,
        sklep, čerpadlo, studna, akvárium… Nemají vlastní elektroměr, dopočítává se.</li>
      <li><strong>+ Fix</strong> — podíl bytu (⅓) na stálých měsíčních platbách z faktury. Platí se
        i při nulové spotřebě — je to cena za přípojku, ne za elektřinu.</li>
      <li><strong>= Platba</strong> — výsledná částka za měsíc, včetně DPH 21 %.</li>
    </ul>
    <p><strong>Proč Byt 3 neplatí míň, když taky svítí ze slunce?</strong> Není vlastník FVE, takže
    platí plnou síťovou cenu za všechno. Rozdíl — hodnota solární elektřiny, kterou dostal —
    je právě bonus, který si rozdělí vlastníci. Tak se jim vrací investice. Je to dohoda,
    ne vlastnost výpočtu, a dá se změnit.</p>
    <p><strong>Součet plateb ≈ faktura, ne přesně.</strong> Vychází o ~1 % jinak, protože appka
    oceňuje solární elektřinu průměrnou cenou podle poměru VT/NT celého domu. Na férovost
    dělení mezi byty to nemá vliv.</p>
  `));

  wrap.append(helpSection('Přetoky (prodej do sítě)', `
    <p>Peníze za elektřinu prodanou do sítě jsou <strong>oddělené od měsíčních plateb bytů</strong> —
    patří jen vlastníkům FVE (50/50). Innogy je vyplácí jednou ročně za období
    1.&nbsp;11.&nbsp;→&nbsp;31.&nbsp;10. Appka přetoky průběžně sčítá po zúčtovacích letech
    a ukazuje orientační výplatu; po ročním vyúčtování od innogy čísla porovnej.</p>
    <p>Pozor: výkup běží až od 14. 5. 2026 — přetoky před tímto datem se neproplácejí,
    i když je appka eviduje.</p>
  `));

  wrap.append(helpSection('Nastavení — ceník a dohoda (kdy do něj sahat)', `
    <p><strong>Ceník</strong> je přednastavený z faktury innogy 04/2026. Měnit ho budeš, jen když
    přijde faktura s jinými cenami (regulované ceny distribuce se mění obvykle k 1. 1.;
    fixace innogy končí 2028). Hodnoty opisuj <strong>bez DPH</strong>.</p>
    <p><strong>Každý měsíc si pamatuje svůj ceník.</strong> Změna cen platí jen pro nově založené
    měsíce — už spočítaná vyúčtování se zpětně nezmění. Pokud má nový ceník platit i pro
    zobrazený měsíc, v Nastavení se objeví žluté upozornění s tlačítkem.</p>
    <p><strong>Dohoda</strong> (kdo vlastní FVE, podíly 50/50, dělení fixů a společné na třetiny)
    se v appce jen zobrazuje. Mění se úpravou zálohy: Export JSON → upravit sekci
    „agreement“ → Import JSON. Je to záměr — omylem přepsané číslo by tiše pokazilo
    všechna vyúčtování.</p>
  `));

  wrap.append(helpSection('Zálohování, přenos a mazání', `
    <ul class="list-disc space-y-1 pl-5">
      <li><strong>Export JSON</strong> stáhne vždy úplně všechno — celou historii, ceníky
        i dohodu. Poslední soubor stačí k obnově celé appky. Ukládej po každém měsíci
        (Disk, e-mail…).</li>
      <li><strong>Import JSON</strong> vše obnoví — i na jiném počítači (tak se appka „přenáší“).</li>
      <li>Data zmizí, když v prohlížeči smažeš „data webů“ — proto zálohuj. Když je poslední
        záloha starší než měsíc (nebo žádná není), appka to sama připomene žlutým proužkem.</li>
      <li><strong>🗑️ Smazat měsíc</strong> maže jen zobrazený měsíc — když něco naklikáš špatně,
        smaž ho a zadej znovu. Spotřeba dalšího měsíce se dopočítá proti nejbližšímu
        staršímu odečtu.</li>
      <li><strong>Smazat všechna data</strong> maže opravdu vše a nejde vrátit.</li>
    </ul>
  `));

  wrap.append(helpSection('Časté situace', `
    <p><strong>Něco jsem špatně naklikal.</strong> Jednotlivá čísla jde prostě přepsat; když chceš
    celý měsíc znovu, smaž ho (🗑️ Smazat měsíc) a projeď průvodcem.</p>
    <p><strong>Zadal jsem stav a spotřeba je 0.</strong> Buď je to první měsíc (chybí předchozí
    odečet), nebo je stav nižší než minule — překlep, appka na to upozorní.</p>
    <p><strong>Žlutý panel hlásí, že součet bytů je vyšší než spotřeba domu.</strong> Někde je chyba
    v opisování — porovnej stavy podružek s minulým měsícem a „Spotřebu domu“ ze SEMS+.</p>
    <p><strong>Byt je prázdný, má platit?</strong> Ano — svůj díl fixů a společné spotřeby (cca
    850 Kč). Fix je platba za přípojku; chodba svítí a čerpadlo běží i pro prázdný byt.</p>
    <p><strong>Přeskočil jsem měsíc.</strong> Nic se neztratí — spotřeba se dopočítá proti poslednímu
    zadanému odečtu. Jen fix se započítá jednou, takže měsíce raději nepřeskakuj.</p>
  `));

  wrap.append(el('div', 'flex justify-end', [backBtn()]));
  return wrap;
}

// === demo mode ===
// Real numbers from the innogy invoice 04/2026 (the ones the tests reproduce):
// March = baseline reading, April = first billed month.
function demoState(): AppState {
  const tariff = structuredClone(state.tariff);
  return {
    tariff,
    agreement: structuredClone(state.agreement),
    records: [
      {
        period: '2026-03',
        meter: { production: 0, houseConsumption: 0, feedIn: 0, gridPurchase: 0 },
        readings: [
          { id: 'flat1', peak: 1250, offPeak: 9860 },
          { id: 'flat2', peak: 2340, offPeak: 15210 },
          { id: 'flat3', peak: 480, offPeak: 3120 },
        ],
        tariff: structuredClone(tariff),
        readingDate: '2026-03-01',
      },
      {
        period: '2026-04',
        meter: { production: 800, houseConsumption: 1756, feedIn: 171, gridPurchase: 1256 },
        readings: [
          { id: 'flat1', peak: 1290, offPeak: 10280 },
          { id: 'flat2', peak: 2430, offPeak: 15860 },
          { id: 'flat3', peak: 486, offPeak: 3164 },
        ],
        tariff: structuredClone(tariff),
        readingDate: '2026-04-01',
      },
    ],
  };
}

function enterDemo() {
  realState = state;
  state = demoState();
  demoMode = true;
  wizardStep = null;
  currentPeriod = '2026-04';
  render();
}

function exitDemo() {
  state = realState ?? loadState();
  realState = null;
  demoMode = false;
  currentPeriod = lastOrNewPeriod();
  render();
}

// Presentation banner: walks a first-time viewer through what the numbers
// mean and what follows from them for each flat.
function demoCard(): HTMLElement {
  const c = el('section', 'rounded-lg border-2 border-sky-300 bg-sky-50 p-5 space-y-3 print:hidden');
  const p = (text: string) => el('p', 'text-sm text-sky-950', text);
  c.append(
    el('h2', 'font-semibold text-sky-900', '🎬 Ukázkový režim — reálný duben 2026 z faktury innogy'),
    el('p', 'text-xs text-sky-700', 'Nic z toho se neukládá a tvoje skutečná data zůstala netknutá. Můžeš si tu klidně klikat, přepisovat čísla nebo projít průvodce — ukázku pak ukončíš tlačítkem dole.'),
    el('div', 'space-y-2', [
      p('📖 Jak číst, co vidíš:'),
      p('1) Dům za duben spotřeboval 1 756 kWh. Z toho 500 kWh dodalo slunce a baterie („FVE pokrytí“ — tuhle elektřinu nebylo potřeba koupit) a 1 256 kWh se koupilo ze sítě — přesně to, co je na faktuře.'),
      p('2) Podle podružek v rozvaděči: Byt 1 spotřeboval 460 kWh, Byt 2 740 kWh, Byt 3 50 kWh. Zbylých 506 kWh jsou společné prostory — chodby, čerpadlo, studna, akvárium… („Společná spotřeba“, dělí se na třetiny).'),
      p('3) Co z toho plyne pro lidi: FVE za duben ušetřila 1 464 Kč. Byt 1 a Byt 2 fotovoltaiku vlastní (50/50), takže každý dostal slevu 631 Kč → Byt 1 platí 1 837 Kč, Byt 2 platí 2 844 Kč (spotřeboval víc). Byt 3 FVE nevlastní, slevu nedostává → 1 023 Kč (skoro celé je třetina fixů a společné spotřeby).'),
      p('4) Součet plateb 5 704 Kč ≈ faktura innogy 5 666 Kč — rozúčtování si tedy „sedí“ s realitou. Drobný rozdíl vysvětluje NAVOD.md.'),
      p('Březen je v ukázce jen „nultý odečet“ (počáteční stavy podružek) — proto má prázdná SEMS+ čísla, ta se z nultého měsíce nepoužívají. Přepni si na něj nahoře v Období. Každá ⓘ ikonka níže vysvětluje, odkud které číslo vzít. Podrobný návod je pod tlačítkem 📖 Návod nahoře.'),
    ]),
    btn('✕ Ukončit ukázku a vrátit moje data', 'bg-sky-600 text-white hover:bg-sky-700', exitDemo)
  );
  return c;
}

// Downloads the FULL state (tariff, agreement, all months) as a JSON backup.
function downloadExport() {
  const blob = new Blob([exportJson(state)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fve-rozuct-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  localStorage.setItem(EXPORT_KEY, new Date().toISOString());
  render(); // refresh the backup nudge
}

// === guided monthly flow (wizard) ===
// Four screens: period → SEMS numbers → submeter readings → check + result.
function renderWizard(): HTMLElement {
  const step = wizardStep!;
  const wrap = el('div', 'mx-auto max-w-2xl px-4 py-8 space-y-6');

  // Baseline months skip the SEMS step (its numbers aren't used for billing),
  // so the progress header shows a 3-step flow instead of 4.
  let titles = ['Období', 'Data ze SEMS+', 'Stavy podružek', 'Kontrola a výsledek'];
  let shown = step;
  if (step > 0 && !previousRecord(state.records, currentPeriod)) {
    titles = ['Období', 'Stavy podružek', 'Uložení'];
    shown = step === 2 ? 1 : 2;
  }

  wrap.append(
    el('header', 'space-y-1', [
      el('h1', 'text-xl font-bold text-slate-900', `🧭 Průvodce měsícem — krok ${shown + 1} ze ${titles.length}`),
      el('p', 'text-sm text-slate-500', titles.map((t, i) => (i === shown ? `● ${t}` : `○ ${t}`)).join('   ')),
    ])
  );

  const nav = (backTo: number | null, nextLabel: string, onNext: () => void) => {
    const row = el('div', 'flex justify-between gap-3');
    row.append(
      backTo === null
        ? btn('Zrušit', 'bg-slate-200 text-slate-700 hover:bg-slate-300', () => { wizardStep = null; render(); })
        : btn('← Zpět', 'bg-slate-200 text-slate-700 hover:bg-slate-300', () => { wizardStep = backTo; render(); })
    );
    row.append(btn(nextLabel, 'bg-emerald-600 text-white hover:bg-emerald-700', onNext));
    return row;
  };

  if (step === 0) {
    // First-ever entry: a reading taken today is the state at the END of the
    // previous month — the baseline gets last month's label, so the current
    // month becomes the first billed one.
    const suggested = state.records.length
      ? nextPeriod(state.records[state.records.length - 1].period)
      : prevPeriod(currentPeriod);
    const input = document.createElement('input');
    // Native month picker shows localized names ("srpen 2026") and returns
    // YYYY-MM; unsupporting browsers fall back to a text field in that format.
    input.type = 'month';
    input.value = suggested;
    input.placeholder = 'RRRR-MM';
    input.className = 'w-44 rounded-md border border-slate-300 px-3 py-2 tabular-nums';
    const box = el('div', 'space-y-3 text-sm text-slate-600');
    box.append(
      el('p', '', 'Průvodce tě provede měsíčním zadáním: 4 čísla ze SEMS+, 6 stavů z podružek, kontrola a výsledek. Zabere to asi 10 minut.'),
      el('div', 'space-y-1', [label('Které období zadáváš?'), input]),
      state.records.length
        ? el('p', 'text-xs text-slate-400', `Poslední zadaný měsíc: ${periodLabel(state.records[state.records.length - 1].period)}. Odečty dělej ideálně vždy k 1. dni měsíce, ať se kryjí s měsíčními čísly ze SEMS+.`)
        : el('div', 'space-y-1 rounded-md bg-amber-50 p-3 text-xs text-amber-800', [
            el('p', 'font-medium', 'Zatím nemáš žádný měsíc — tohle kolo je „nultý odečet“.'),
            el('p', '', 'Jen se zapíšou počáteční stavy podružek; skutečné vyúčtování uvidíš až příští měsíc, protože zatím není s čím porovnávat.'),
            el('p', '', `Odečet, který dnes uděláš, platí jako stav ke konci minulého měsíce — proto je předvyplněno období ${periodLabel(prevPeriod(currentPeriod))}. Prvním účtovaným měsícem pak bude ${periodLabel(currentPeriod)}.`),
            el('p', '', 'Začít můžeš klidně dnes, kterýkoli den v měsíci — nic se nerozbije. Jen první vyúčtovaný měsíc pak bude trochu nepřesný: spotřebu bytů od 1. dne měsíce do dne odečtu appka nedokáže rozdělit na byty a spadne do společné. Od druhého měsíce už všechno sedí přesně.'),
            el('p', '', 'Do budoucna proto odečítej vždy k 1. dni měsíce (třeba ráno) — pak se stavy podružek kryjí s měsíčními čísly ze SEMS+.'),
          ])
    );
    wrap.append(card('Období', [box]));
    wrap.append(nav(null, 'Pokračovat →', () => {
      const p = input.value.trim();
      if (!/^\d{4}-\d{2}$/.test(p)) {
        alert('Vyber měsíc, případně ho zadej ve formátu 2026-07 (= červenec 2026).');
        return;
      }
      currentPeriod = p;
      currentRecord();
      persist();
      // Baseline month → straight to the submeter readings, SEMS is not needed.
      wizardStep = previousRecord(state.records, p) ? 1 : 2;
      render();
    }));
    return wrap;
  }

  const rec = currentRecord();
  const prev = previousRecord(state.records, currentPeriod);

  if (step === 1) {
    const box = el('div', 'space-y-3');
    if (!prev) box.append(baselineSemsNote());
    box.append(
      el('p', 'text-sm text-slate-600', `Otevři aplikaci SEMS+ (nebo semsportal.com), přihlas se účtem k FVE a v měsíčních statistikách najdi tato 4 čísla za ${periodLabel(rec.period)}. U každého pole je ⓘ s přesným místem.`),
      meterGridEl(rec)
    );
    wrap.append(card('Data ze SEMS+ (celý dům)', [box]));
    wrap.append(nav(0, 'Pokračovat →', () => { wizardStep = 2; render(); }));
    return wrap;
  }

  if (step === 2) {
    const box = el('div', 'space-y-3');
    box.append(
      el('p', 'text-sm text-slate-600', 'Dojdi k rozvaděči a z displejů 3 podružek (CIT 372L) opiš stavy T1 a T2 — tlačítkem na měřidle mezi nimi přepínáš. Zadávej STAV (velké kumulativní číslo), ne spotřebu.'),
      readingsBoxEl(rec, prev)
    );
    wrap.append(card('Stavy podružek', [box]));
    wrap.append(nav(prev ? 1 : 0, 'Pokračovat →', () => { wizardStep = 3; render(); }));
    return wrap;
  }

  // step 3 — check + result (baseline months have nothing to check or bill)
  if (prev) {
    const flatConsumption = consumptionFromReadings(rec.readings, prev.readings);
    const warnings = collectWarnings(rec, prev, flatConsumption);
    if (warnings.length) wrap.append(warningsCardEl(warnings));
    else wrap.append(el('p', 'rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800', '✓ Kontroly prošly — čísla mezi sebou sedí.'));
    wrap.append(resultCard(calculateBilling(rec.meter, flatConsumption, rec.tariff, state.agreement)));
  } else {
    wrap.append(
      el('div', 'rounded-lg border border-slate-200 bg-white p-4 space-y-2 text-sm text-slate-600', [
        el('p', 'font-medium text-slate-900', '✓ Nultý odečet je uložený.'),
        el('p', '', 'Počáteční stavy podružek jsou zapsané. Vyúčtování se objeví u příštího měsíce, až bude s čím porovnávat.'),
        el('p', '', 'Čísla ze SEMS+ (výroba, spotřeba, nákup) za tento měsíc nejsou potřeba, proto je průvodce přeskočil. Jen kdyby už běžel výkup přetoků, můžeš „Přetoky do sítě“ kdykoli doplnit na hlavní stránce — počítají se do ročního přehledu.'),
      ])
    );
  }

  const finishBox = el('div', 'flex gap-3 flex-wrap');
  finishBox.append(btn('⬇️ Stáhnout zálohu (JSON)', 'bg-slate-200 text-slate-700 hover:bg-slate-300', downloadExport));
  if (prev)
    finishBox.append(
      btn('🖨️ Tisk / PDF', 'bg-slate-200 text-slate-700 hover:bg-slate-300', () => {
        // Print the clean main-page statement, not the wizard screen.
        wizardStep = null;
        render();
        window.print();
      })
    );
  wrap.append(card('Nakonec: ulož zálohu', [finishBox, el('p', 'text-xs text-slate-400', 'Data žijí jen v tomto prohlížeči — stáhni JSON a ulož si ho (Disk, e-mail…). Obsahuje celou historii, ne jen tento měsíc.')]));

  wrap.append(nav(2, '✓ Hotovo', () => { wizardStep = null; render(); }));
  return wrap;
}

function exportCard() {
  const box = el('div', 'flex gap-3 flex-wrap');

  box.append(
    btn('⬇️ Export JSON (záloha)', 'bg-emerald-600 text-white hover:bg-emerald-700', downloadExport)
  );

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json';
  fileInput.className = 'hidden';
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    try {
      state = importJson(await f.text());
      currentPeriod = lastOrNewPeriod();
      save();
    } catch {
      alert('Nepodařilo se načíst soubor.');
    }
  });
  box.append(
    btn('⬆️ Import JSON', 'bg-slate-200 text-slate-700 hover:bg-slate-300', () => fileInput.click()),
    fileInput
  );

  box.append(
    btn('🖨️ Tisk / PDF', 'bg-slate-200 text-slate-700 hover:bg-slate-300', () => window.print())
  );

  box.append(
    btn('🗑️ Smazat všechna data', 'bg-red-50 text-red-700 hover:bg-red-100', () => {
      if (confirm('Opravdu smazat všechna data? Tuto akci nelze vrátit. Doporučujeme nejdřív Export JSON.')) {
        localStorage.removeItem('fve-rozuct-v1');
        state = loadState();
        currentPeriod = lastOrNewPeriod();
        render();
      }
    })
  );

  return card('Záloha a export', [box], undefined, `
    <p>Všechna data žijí <strong>jen v tomto prohlížeči</strong> — smazáním „dat webů“ nebo ztrátou
    počítače zmizí. Proto po každém zadaném měsíci klikni na <strong>Export JSON</strong>.</p>
    <p>Export stáhne vždy <strong>úplně všechno</strong> (celou historii, ceníky i dohodu) —
    poslední soubor stačí k obnově celé appky. <strong>Import JSON</strong> ji obnoví i na jiném
    počítači; tak se appka „přenáší“. Soubor si ukládej třeba na Disk nebo posílej e-mailem.</p>
  `);
}

// === small DOM helpers ===
function el(tag: string, cls = '', children: string | (Node | string)[] = []): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (typeof children === 'string') e.textContent = children;
  else for (const c of children) e.append(c);
  return e;
}
function card(title: string, children: Node[], hint?: string, helpHtml?: string): HTMLElement {
  const c = el('section', 'rounded-lg border border-slate-200 bg-white p-5 space-y-3 print:border-0 print:p-0');
  const h = el('h2', 'flex items-center gap-1.5 font-semibold text-slate-900');
  h.append(el('span', '', title));
  if (hint) h.append(infoButton(hint));
  c.append(h);
  if (helpHtml) c.append(helpDetails(helpHtml));
  for (const ch of children) c.append(ch);
  return c;
}

// Every input change re-renders the whole page, which would collapse any open
// <details>. Remember open/closed per key and restore it after re-render.
const openDetails = new Set<string>();
function trackOpen(det: HTMLDetailsElement, key: string) {
  det.open = openDetails.has(key);
  det.addEventListener('toggle', () => {
    if (det.open) openDetails.add(key);
    else openDetails.delete(key);
  });
}

// Collapsed task-level help right inside a card — the middle layer between
// the ⓘ field tooltips and the full-page guide. Static trusted text.
function helpDetails(html: string): HTMLElement {
  const det = document.createElement('details');
  det.className = 'rounded-md bg-slate-50 px-3 py-2 print:hidden';
  trackOpen(det, 'help:' + html.slice(0, 60));
  const sum = document.createElement('summary');
  sum.className = 'cursor-pointer select-none text-xs font-medium text-emerald-700';
  sum.textContent = '❓ Jak na tuhle sekci';
  const body = el('div', 'mt-2 space-y-1.5 text-sm leading-relaxed text-slate-600');
  body.innerHTML = html;
  const link = el('button', 'mt-1.5 block text-xs font-medium text-emerald-700 underline', 'Otevřít celý návod →');
  link.addEventListener('click', () => {
    helpMode = true;
    render();
  });
  det.append(sum, body, link);
  return det;
}
function label(text: string, hint?: string): HTMLElement {
  const l = el('label', 'flex items-center gap-1 text-xs font-medium text-slate-500');
  l.append(el('span', '', text));
  if (hint) l.append(infoButton(hint));
  return l;
}

// Small ⓘ icon with a hover/tap tooltip explaining where to get the value.
function infoButton(hint: string): HTMLElement {
  const wrap = el('span', 'relative inline-flex group');
  const icon = el(
    'span',
    'flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 group-hover:bg-emerald-500 group-hover:text-white',
    'i'
  );
  const tip = el(
    'span',
    'pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-56 -translate-x-1/2 rounded-md bg-slate-800 px-3 py-2 text-xs font-normal leading-snug text-white shadow-lg group-hover:block',
    hint
  );
  // group-hover never fires on touch screens — toggle the tooltip on tap too.
  icon.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    tip.classList.toggle('hidden');
    tip.classList.toggle('block');
  });
  wrap.append(icon, tip);
  return wrap;
}
function pill(title: string, value: string, cls: string): HTMLElement {
  const p = el('div', `rounded-lg px-4 py-2 ${cls}`);
  p.append(el('div', 'text-xs opacity-70', title), el('div', 'font-semibold', value));
  return p;
}
function btn(text: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = `rounded-md px-4 py-2 text-sm font-medium transition ${cls}`;
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
// Buyback settlement year runs 1 Nov → 31 Oct; Nov and Dec belong to the next one.
function billingYear(p: string): string {
  const [y, m] = p.split('-').map(Number);
  return m >= 11 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}
function nextPeriod(p: string): string {
  const [y, mo] = p.split('-').map(Number);
  const d = new Date(y, mo); // next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function prevPeriod(p: string): string {
  const [y, mo] = p.split('-').map(Number);
  const d = new Date(y, mo - 2); // previous month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

render();
