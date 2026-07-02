// === Billing calculation core for the rooftop PV split ===
// Pure TypeScript, no UI, no dependencies. Logic per MODEL_ROZUCTU.md.

export interface Tariff {
  energyMWh: number; // wholesale energy (Optimal 36), before discount [CZK/MWh]
  discountPct: number; // individual discount off energy (both peak/off-peak) [%]
  distPeakMWh: number; // distribution, peak / VT (D57d)
  distOffPeakMWh: number; // distribution, off-peak / NT (D57d)
  systemMWh: number; // system services
  taxMWh: number; // electricity tax
  fixedSupplyMonth: number; // fixed monthly supply charge [CZK/month]
  fixedDistributionMonth: number; // fixed monthly distribution charge (3×40A)
  fixedOffgridMonth: number; // non-network infrastructure operation
  feedInMWh: number; // feed-in / buyback price for surplus (flat)
  vatPct: number; // [%]
}

export interface FlatConfig {
  id: string;
  name: string;
  pvOwner: boolean; // receives PV bonus and feed-in payout?
}

export interface Agreement {
  flats: FlatConfig[];
  pvShares: Record<string, number>; // % of bonus among owners (Σ = 100)
  fixedShares: Record<string, number>; // proportional shares of fixed charges
  commonShares: Record<string, number>; // proportional shares of common consumption
}

export interface MeterData {
  production: number; // [kWh]
  houseConsumption: number;
  feedIn: number;
  gridPurchase: number;
}

export interface FlatConsumption {
  id: string;
  peak: number; // consumption for the period [kWh] (difference of readings)
  offPeak: number;
}

export interface BillingRow {
  id: string;
  name: string;
  peak: number;
  offPeak: number;
  consumption: number;
  gridCost: number; // incl. VAT
  pvBonus: number; // incl. VAT (positive = discount)
  common: number; // incl. VAT
  fixed: number; // incl. VAT
  total: number; // incl. VAT
}

export interface BillingResult {
  pvKwh: number;
  commonKwh: number;
  flatsSum: number;
  avgPriceMWh: number;
  totalSavings: number;
  flatsBonusTotal: number;
  rows: BillingRow[];
  grandTotal: number;
}

// Default tariff from innogy invoice 04/2026 (excl. VAT, CZK/MWh resp. CZK/month).
export const DEFAULT_TARIFF: Tariff = {
  energyMWh: 3000,
  discountPct: 15,
  distPeakMWh: 754.77,
  distOffPeakMWh: 116.5,
  systemMWh: 164.24,
  taxMWh: 28.3,
  fixedSupplyMonth: 127.0,
  fixedDistributionMonth: 896.0,
  fixedOffgridMonth: 12.87,
  feedInMWh: 900,
  vatPct: 21,
};

export const DEFAULT_AGREEMENT: Agreement = {
  flats: [
    { id: 'flat1', name: 'Byt 1 (1.N.P)', pvOwner: true },
    { id: 'flat2', name: 'Byt 2 (2.N.P)', pvOwner: true },
    { id: 'flat3', name: 'Byt 3 (3.N.P)', pvOwner: false },
  ],
  pvShares: { flat1: 50, flat2: 50 },
  fixedShares: { flat1: 1, flat2: 1, flat3: 1 },
  commonShares: { flat1: 1, flat2: 1, flat3: 1 },
};

const round = (x: number, d = 2): number => Math.round(x * 10 ** d) / 10 ** d;
const vatMult = (t: Tariff): number => 1 + t.vatPct / 100;

// Derived per-MWh prices [CZK/MWh, excl. VAT].
export function pricesPerMWh(t: Tariff) {
  const energy = t.energyMWh * (1 - t.discountPct / 100);
  return {
    energy,
    peak: energy + t.distPeakMWh + t.systemMWh + t.taxMWh,
    offPeak: energy + t.distOffPeakMWh + t.systemMWh + t.taxMWh,
    fixedTotalMonth: t.fixedSupplyMonth + t.fixedDistributionMonth + t.fixedOffgridMonth,
  };
}

export function calculateBilling(
  meter: MeterData,
  flats: FlatConsumption[],
  tariff: Tariff = DEFAULT_TARIFF,
  agreement: Agreement = DEFAULT_AGREEMENT
): BillingResult {
  const prices = pricesPerMWh(tariff);
  const m = vatMult(tariff);

  const houseConsumption = meter.houseConsumption;
  const pvKwh = Math.max(0, houseConsumption - meter.gridPurchase);

  const sumFlatPeak = flats.reduce((s, f) => s + f.peak, 0);
  const sumFlatOffPeak = flats.reduce((s, f) => s + f.offPeak, 0);
  const flatsSum = sumFlatPeak + sumFlatOffPeak;
  const commonKwh = Math.max(0, houseConsumption - flatsSum);

  // Common consumption (no dedicated meter) split into peak/off-peak by flats' ratio.
  const peakRatio = flatsSum > 0 ? sumFlatPeak / flatsSum : 0.5;
  const commonPeak = commonKwh * peakRatio;
  const commonOffPeak = commonKwh * (1 - peakRatio);

  interface Unit {
    id: string;
    peak: number;
    offPeak: number;
    isFlat: boolean;
    gridCost: number;
    pvBonus: number;
  }

  const gridCost = (peak: number, offPeak: number): number =>
    (peak / 1000) * prices.peak + (offPeak / 1000) * prices.offPeak;

  const units: Unit[] = [
    ...flats.map((f) => ({
      id: f.id,
      peak: f.peak,
      offPeak: f.offPeak,
      isFlat: true,
      gridCost: 0,
      pvBonus: 0,
    })),
    { id: 'common', peak: commonPeak, offPeak: commonOffPeak, isFlat: false, gridCost: 0, pvBonus: 0 },
  ];

  const totalPeak = units.reduce((s, u) => s + u.peak, 0);
  const totalOffPeak = units.reduce((s, u) => s + u.offPeak, 0);
  const totalKwh = totalPeak + totalOffPeak;
  const avgPriceMWh =
    totalKwh > 0 ? (totalPeak * prices.peak + totalOffPeak * prices.offPeak) / totalKwh : 0;

  const totalSavings = (pvKwh / 1000) * avgPriceMWh;

  units.forEach((u) => {
    u.gridCost = gridCost(u.peak, u.offPeak);
    u.pvBonus = totalKwh > 0 ? totalSavings * ((u.peak + u.offPeak) / totalKwh) : 0;
  });

  const common = units.find((u) => !u.isFlat)!;
  const commonNet = common.gridCost - common.pvBonus;

  const flatsBonusTotal = units
    .filter((u) => u.isFlat)
    .reduce((s, u) => s + u.pvBonus, 0);

  const sumShares = (shares: Record<string, number>): number =>
    flats.reduce((s, f) => s + (shares[f.id] || 0), 0);
  const sumFixed = sumShares(agreement.fixedShares);
  const sumCommon = sumShares(agreement.commonShares);
  const fixedTotalWithVat = prices.fixedTotalMonth * m;
  const sumPvShares =
    Object.values(agreement.pvShares).reduce((s, x) => s + x, 0) || 100;

  const rows: BillingRow[] = flats.map((f) => {
    const u = units.find((x) => x.id === f.id)!;
    const fixedShare = (agreement.fixedShares[f.id] || 0) / (sumFixed || 1);
    const commonShare = (agreement.commonShares[f.id] || 0) / (sumCommon || 1);

    const flatConfig = agreement.flats.find((x) => x.id === f.id);
    const sharePct = agreement.pvShares[f.id] || 0;
    const ownerBonus = flatConfig?.pvOwner
      ? flatsBonusTotal * (sharePct / sumPvShares)
      : 0;

    const gridWithVat = u.gridCost * m;
    const bonusWithVat = ownerBonus * m;
    const commonWithVat = commonNet * commonShare * m;
    const fixedWithVat = fixedTotalWithVat * fixedShare;
    const total = gridWithVat - bonusWithVat + commonWithVat + fixedWithVat;

    return {
      id: f.id,
      name: flatConfig?.name ?? f.id,
      peak: f.peak,
      offPeak: f.offPeak,
      consumption: f.peak + f.offPeak,
      gridCost: round(gridWithVat),
      pvBonus: round(bonusWithVat),
      common: round(commonWithVat),
      fixed: round(fixedWithVat),
      total: round(total),
    };
  });

  return {
    pvKwh: round(pvKwh, 1),
    commonKwh: round(commonKwh, 1),
    flatsSum: round(flatsSum, 1),
    avgPriceMWh: round(avgPriceMWh),
    totalSavings: round(totalSavings),
    flatsBonusTotal: round(flatsBonusTotal),
    rows,
    grandTotal: round(rows.reduce((s, r) => s + r.total, 0)),
  };
}

// Sanity checks per MODEL_ROZUCTU.md §3 — the SEMS numbers and submeter readings
// must roughly agree. Returns human-readable warnings (Czech, shown in the UI).
export function checkConsistency(meter: MeterData, flats: FlatConsumption[]): string[] {
  const warnings: string[] = [];
  if (meter.houseConsumption <= 0) return warnings; // month not filled in yet

  const flatsSum = flats.reduce((s, f) => s + f.peak + f.offPeak, 0);
  const pvKwh = meter.houseConsumption - meter.gridPurchase;

  if (flatsSum > meter.houseConsumption) {
    warnings.push(
      `Součet spotřeb bytů (${Math.round(flatsSum)} kWh) je vyšší než spotřeba domu ze SEMS+ ` +
        `(${Math.round(meter.houseConsumption)} kWh). To nemůže nastat — zkontroluj odečty podružek ` +
        `i hodnotu „Spotřeba domu“. Společná spotřeba teď vychází 0.`
    );
  }
  if (pvKwh < 0) {
    warnings.push(
      `Nákup ze sítě (${Math.round(meter.gridPurchase)} kWh) je vyšší než spotřeba domu ` +
        `(${Math.round(meter.houseConsumption)} kWh) — zkontroluj hodnoty ze SEMS+. ` +
        `FVE pokrytí teď vychází 0.`
    );
  }
  // Production should ≈ feed-in + PV coverage; battery charge/discharge and losses
  // explain small gaps, a large gap means a wrong reading.
  if (meter.production > 0 && pvKwh >= 0) {
    const expected = pvKwh + meter.feedIn;
    if (Math.abs(meter.production - expected) / meter.production > 0.25) {
      warnings.push(
        `Kontrola: výroba FVE (${Math.round(meter.production)} kWh) se dost liší od ` +
          `„FVE pokrytí + přetoky“ (${Math.round(expected)} kWh). Menší rozdíl je normální ` +
          `(baterie, ztráty), velký rozdíl znamená špatně opsané číslo ze SEMS+.`
      );
    }
  }
  return warnings;
}

// Splits an amount among PV owners by their agreed shares.
export function splitPvShares(amount: number, agreement: Agreement): Record<string, number> {
  const sumShares =
    Object.values(agreement.pvShares).reduce((s, x) => s + x, 0) || 100;
  const payouts: Record<string, number> = {};
  for (const [id, pct] of Object.entries(agreement.pvShares)) {
    payouts[id] = round(amount * (pct / sumShares));
  }
  return payouts;
}

export function calculateFeedIn(
  feedInKwhYear: number,
  tariff: Tariff = DEFAULT_TARIFF,
  agreement: Agreement = DEFAULT_AGREEMENT
): { revenue: number; payouts: Record<string, number> } {
  const revenue = (feedInKwhYear / 1000) * tariff.feedInMWh;
  return { revenue: round(revenue), payouts: splitPvShares(revenue, agreement) };
}
