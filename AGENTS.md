# FVE rozúčet — pokyny pro AI agenty

Webová appka, která jednou měsíčně rozpočítá elektřinu v domě s fotovoltaikou a baterií mezi tři byty. Běží celá v prohlížeči (localStorage, žádný backend) a je nasazená na GitHub Pages: https://janpodmolik.github.io/fve/

## Nejdřív tohle

- **Existuje-li `dum/AGENTS.md`, přečti ho jako první.** Je to kontext konkrétního domu: kdo je kdo, kde jsou data, jak se s nimi pracuje a jaká pravidla platí pro texty a čísla. Většina práce v tomhle repu se týká právě složky `dum/`, ne kódu appky.
- **Necommituj a nepushuj, pokud o to uživatel výslovně neřekne.** Push do `main` appku rovnou nasadí.
- **Soukromá data nikdy do gitu.** Složky `dum/`, `predani/` a `data/` jsou v `.gitignore` záměrně. Neodebírej je odtud a jejich obsah nekopíruj do sledovaných souborů.

## Uspořádání

```
src/            appka
  calc.ts       výpočetní jádro (čistý TypeScript, bez UI)
  storage.ts    datový model, ukládání, import/export zálohy
  main.ts       uživatelské rozhraní
  calc.test.ts  testy
scripts/        nástroje nad stejným jádrem
  rozuct.ts     rozúčet ze zálohy appky do terminálu
  vyuctovani.ts rozúčet do tabulek (CSV + Markdown)
  diagnostika.ts spotřeba po obdobích v kWh/den
  balicek.py    zabalení a rozbalení soukromé složky dum/
INSTALACE.md    jak projekt rozjet na novém počítači
NAVOD.md        návod k appce pro laika (stejný text je v appce pod tlačítkem Návod)
MODEL_ROZUCTU.md  jak se rozúčet počítá a proč

dum/            SOUKROMÁ složka domu, není v gitu (data, výstupy, komunikace, skripty na podklady)
predani/        zipy složky dum/ k ručnímu předání, není v gitu
```

## Příkazy

```bash
npm install          # jednorázově
npm test             # testy výpočetního jádra
npm run dev          # appka lokálně
npm run build        # produkční build
npm run rozuct       # rozúčet z dum/data/appka.json do terminálu
npm run vyuctovani   # přehled vyúčtování do dum/vystupy/
npm run diagnostika  # spotřeba bytů a společné větve po obdobích v kWh/den
python3 scripts/balicek.py zabal            # dum/ → predani/dum-RRRR-MM-DD.zip
python3 scripts/balicek.py rozbal soubor.zip  # zip → dum/ (stávající dum/ napřed zazálohuje)
```

Potřeba je Node.js 20+, Python 3 a pro tvorbu PDF prohlížeč Chrome nebo Edge.

## Když se mění kód appky

- Výpočet patří do `src/calc.ts` a ke každé změně chování test v `src/calc.test.ts`. Před dokončením pusť `npm test` a `npm run build`.
- Skripty v `scripts/` musí počítat stejným kódem jako appka (importují `src/calc.ts` a `src/storage.ts`), ne vlastní kopií vzorců.
- Návod je na dvou místech: `NAVOD.md` a `renderHelp()` v `src/main.ts`. Měň oba.
- Záloha appky (JSON) je zároveň vstup skriptů. Změna datového modelu potřebuje migraci v `normalize()` v `src/storage.ts`, aby šly načíst starší zálohy.

## Jak se soukromá data dostanou do repa a zpět

Repo se klonuje z GitHubu, data domu ne. Ta se předávají ručně jedním zipem (`scripts/balicek.py`), který se rozbalí do `dum/`. Aktualizace kódu jde přes `git pull` a složky `dum/` se nedotkne.
