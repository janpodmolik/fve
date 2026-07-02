import { describe, it, expect } from 'vitest';
import {
  pricesPerMWh,
  calculateBilling,
  calculateFeedIn,
  checkConsistency,
  DEFAULT_TARIFF,
  DEFAULT_AGREEMENT,
  type MeterData,
  type FlatConsumption,
} from './calc';

describe('tariff', () => {
  it('derived peak/off-peak prices match invoice 04/2026 (~3.50 / ~2.86 CZK/kWh)', () => {
    const p = pricesPerMWh(DEFAULT_TARIFF);
    expect(p.peak / 1000).toBeCloseTo(3.497, 2);
    expect(p.offPeak / 1000).toBeCloseTo(2.859, 2);
    expect(p.fixedTotalMonth).toBeCloseTo(1035.87, 2);
  });
});

describe('billing — illustrative April', () => {
  // Invoice: grid purchase peak 86 + off-peak 1170 = 1256 kWh. PV coverage estimate 500 kWh.
  const meter: MeterData = {
    production: 800,
    houseConsumption: 1756,
    feedIn: 171,
    gridPurchase: 1256,
  };
  const flats: FlatConsumption[] = [
    { id: 'flat1', peak: 40, offPeak: 420 },
    { id: 'flat2', peak: 90, offPeak: 650 },
    { id: 'flat3', peak: 6, offPeak: 44 },
  ];

  const r = calculateBilling(meter, flats, DEFAULT_TARIFF, DEFAULT_AGREEMENT);

  it('PV coverage = house consumption − grid purchase', () => {
    expect(r.pvKwh).toBe(500);
  });

  it('common consumption = house − Σ flats', () => {
    expect(r.commonKwh).toBeCloseTo(1756 - 1250, 0); // 506
  });

  it('sum of flat totals is close to invoice 5666 CZK (±10 %)', () => {
    expect(r.grandTotal).toBeGreaterThan(5666 * 0.9);
    expect(r.grandTotal).toBeLessThan(5666 * 1.1);
  });

  it('flat2 pays more than flat1 — higher consumption', () => {
    const f1 = r.rows.find((x) => x.id === 'flat1')!;
    const f2 = r.rows.find((x) => x.id === 'flat2')!;
    expect(f2.total).toBeGreaterThan(f1.total);
  });

  it('empty flat3 pays nonzero (carries fixed + share of common)', () => {
    const f3 = r.rows.find((x) => x.id === 'flat3')!;
    expect(f3.total).toBeGreaterThan(0);
    expect(f3.pvBonus).toBe(0); // not a PV owner
  });

  it('owners (flat1, flat2) get equal PV bonus (50/50)', () => {
    const f1 = r.rows.find((x) => x.id === 'flat1')!;
    const f2 = r.rows.find((x) => x.id === 'flat2')!;
    expect(f1.pvBonus).toBeCloseTo(f2.pvBonus, 1);
    expect(f1.pvBonus).toBeGreaterThan(0);
  });
});

describe('consistency checks', () => {
  const okMeter: MeterData = { production: 800, houseConsumption: 1756, feedIn: 171, gridPurchase: 1256 };
  const okFlats: FlatConsumption[] = [
    { id: 'flat1', peak: 40, offPeak: 420 },
    { id: 'flat2', peak: 90, offPeak: 650 },
    { id: 'flat3', peak: 6, offPeak: 44 },
  ];

  it('valid April data produce no warnings', () => {
    expect(checkConsistency(okMeter, okFlats)).toEqual([]);
  });

  it('empty month (house consumption 0) produces no warnings', () => {
    expect(checkConsistency({ production: 0, houseConsumption: 0, feedIn: 0, gridPurchase: 0 }, okFlats)).toEqual([]);
  });

  it('warns when flats sum exceeds house consumption', () => {
    const w = checkConsistency({ ...okMeter, houseConsumption: 1000 }, okFlats);
    expect(w.some((x) => x.includes('vyšší než spotřeba domu'))).toBe(true);
  });

  it('warns when grid purchase exceeds house consumption', () => {
    const w = checkConsistency({ ...okMeter, gridPurchase: 2000 }, okFlats);
    expect(w.some((x) => x.includes('Nákup ze sítě'))).toBe(true);
  });

  it('warns when production disagrees with coverage + feed-in', () => {
    const w = checkConsistency({ ...okMeter, production: 2000 }, okFlats);
    expect(w.some((x) => x.includes('výroba FVE'))).toBe(true);
  });
});

describe('feed-in', () => {
  it('yearly feed-in × 900 CZK/MWh, payout 50/50', () => {
    const { revenue, payouts } = calculateFeedIn(2000, DEFAULT_TARIFF, DEFAULT_AGREEMENT);
    expect(revenue).toBe(1800); // 2 MWh × 900
    expect(payouts.flat1).toBe(900);
    expect(payouts.flat2).toBe(900);
  });
});
