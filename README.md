# FVE rozúčet

Jednoduchá SPA na rozúčtování elektřiny z FVE + baterie mezi 3 byty v rodinném domě.
Data jen v prohlížeči (localStorage), žádný backend.

**Dokumentace:**
- [NAVOD.md](NAVOD.md) — návod k obsluze pro laika (co kam zadat, jak číst výsledek, vzorový příklad).
  Tentýž návod je i **přímo v appce** pod tlačítkem 📖 Návod (`renderHelp()` v main.ts — udržovat v souladu)
- [MODEL_ROZUCTU.md](MODEL_ROZUCTU.md) — logika výpočtu, ceník, otevřené dohody, mapování na kód

## Nástroje
Vite + TypeScript (bez frameworku) + Tailwind v4. Výpočetní jádro je čistý TS modul
([src/calc.ts](src/calc.ts)), takže jde testovat i znovupoužít.

## Spuštění
```bash
npm install
npm run dev      # lokální dev server s živým reloadem
npm test         # testy výpočetního jádra (vitest)
npm run build    # produkční build do dist/ (pro GitHub Pages)
```

## Jak to funguje
- **Vstup:** 4 čísla ze SEMS+ (výroba, spotřeba domu, přetoky, nákup ze sítě) +
  stavy podružek CIT 372L (T1=VT, T2=NT) za 3 byty.
- **Spotřeba bytu** = rozdíl stavů oproti minulému měsíci.
- **Společná spotřeba** = spotřeba domu − součet bytů (chodby, čerpadlo, studna…).
- **FVE bonus** jen vlastníkům FVE (Byt 1 + Byt 2, 50/50); díl úspory připadající
  na společnou spotřebu zlevňuje společnou položku všem. Fixy a společná /3.
- **Přetoky** 900 Kč/MWh, zúčtování po letech výkupu (1.11.→31.10.), vlastníkům 50/50.
- **Kontroly vstupů** — žlutý panel upozorní na nekonzistentní odečty
  (`checkConsistency` v calc.ts + kontrola klesajících stavů podružek).
- **Ceník je zamrzlý per měsíc** — každý `MonthlyRecord` nese kopii ceníku,
  změna aktuálního ceníku nepřepíše historická vyúčtování.
- **🧭 Průvodce měsícem** — 4krokový wizard pro měsíční zadání (období → SEMS+
  → podružky → kontrola/výsledek + připomínka zálohy).
- **🎬 Ukázka** — demo režim s reálnými čísly z faktury 04/2026 a vysvětlujícím
  panelem; běží jen v paměti (persist() je v demu no-op), reálná data zůstávají.

Ceník je přednastavený z faktury innogy 04/2026; lze upravit v sekci Nastavení.
Dohoda (vlastníci, podíly, klíče dělení) je v UI jen ke čtení — mění se přes
JSON export/import (záměr, viz NAVOD.md).
