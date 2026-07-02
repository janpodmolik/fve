# Model rozúčtu FVE — logika výpočtu

> Rozkresluje, jak appka spočítá rozúčet elektřiny mezi 3 byty.
> Postaveno na reálných cenách z faktury innogy 04/2026 a rozhodnutích Honzy (6.6.2026).
> **Stav: IMPLEMENTOVÁNO** v [src/calc.ts](src/calc.ts) podle §4 + §5 (viz §8 — mapování na kód).
> Návod k obsluze pro laika: [NAVOD.md](NAVOD.md). Otevřené body označené ⚠️ → doplní Marek.

---

## 1. Vstupní data (co se zadává každý měsíc)

### Ze SEMS+ (celý dům, 4 čísla)
- `výroba_FVE` [kWh] — kolik panely vyrobily
- `spotřeba_domu` [kWh] — kolik celý dům spotřeboval
- `přetoky` [kWh] — kolik šlo do sítě (prodej)
- `nákup_ze_sítě` [kWh] — kolik dům koupil ze sítě

### Z podružek 3× CIT 372L (co spotřeboval každý byt)
- `byt[i].VT`, `byt[i].NT` [kWh] — odečet za období (konec − začátek)
- Pokud byt neměří VT/NT zvlášť → jen `byt[i].celkem`, VT/NT se dopočítá poměrem (viz §5)

### Z faktury innogy (ceník — zadá se 1×, mění se zřídka)
viz §2.

### Konfigurace dohody (zadá se 1×)
- `vlastníci_FVE` = [byt1 (Marek), byt2 (soused)] — kdo dostává FVE bonus a přetoky
- `podíly_FVE` = 50 / 50
- `klíč_fixy` = rovným dílem na 3 byty (default)
- `klíč_společná_spotřeba` = rovným dílem na 3 byty (default) ⚠️
- `má_dům_společnou_spotřebu` = **ANO** (potvrzeno z rozvaděče — viz §5, není zanedbatelná)
- `byty_měří_VTNT` = **ANO** (potvrzeno z rozvaděče — podružky mají T1/T2)

---

## 2. Ceník (faktura innogy 04/2026, vše bez DPH; DPH 21 %)

| Složka | Hodnota | Typ |
|---|---|---|
| Silová elektřina (Optimal 36), po slevě 15 % | 3 000 × 0,85 = **2 550 Kč/MWh** | VT i NT stejně |
| Distribuce VT (D57d) | **754,77 Kč/MWh** | regulované |
| Distribuce NT (D57d) | **116,50 Kč/MWh** | regulované |
| Systémové služby | **164,24 Kč/MWh** | regulované |
| Daň z elektřiny | **28,30 Kč/MWh** | regulované |
| Stálý plat dodávka | **127,00 Kč/měs** | fix |
| Stálý plat distribuce (3×40A) | **896,00 Kč/měs** | fix |
| Provoz nesíťové infrastruktury | **12,87 Kč/měs** | fix |
| **Výkup přetoků** | **900 Kč/MWh** (jednotná) | příjem |

**Odvozená cena za spotřebovanou kWh (bez DPH):**
- `cena_VT = 2550 + 754,77 + 164,24 + 28,30 = ` **3 497,31 Kč/MWh ≈ 3,50 Kč/kWh** ✓ (sedí s fakturou)
- `cena_NT = 2550 + 116,50 + 164,24 + 28,30 = ` **2 859,04 Kč/MWh ≈ 2,86 Kč/kWh** ✓ (sedí s fakturou)
- `fixy_celkem = 127 + 896 + 12,87 = ` **1 035,87 Kč/měs**

> Pozn.: appka může pracovat s/bez DPH — Marek je fyzická osoba, takže koncové částky pro byty počítáme **s DPH** (×1,21), protože tolik reálně platí.

---

## 3. Klíčový mechanismus — odkud se bere FVE bonus

Podružky měří **co byt reálně spotřeboval** (ať ze sítě nebo ze slunce).
Faktura měří **jen co dům koupil ze sítě**.
Rozdíl = **energie z FVE+baterie**, kterou byty užily zadarmo (resp. za interní cenu).

```
FVE_kWh_celkem = spotřeba_domu − nákup_ze_sítě        (ze SEMS)
              ≈ Σ byty (VT+NT) − (faktura VT+NT)       (kontrolní rovnost)
```

Tyhle dvě čísla by měly +- sedět. Když nesedí výrazně → chyba v odečtu nebo společná spotřeba (§5).

---

## 4. Výpočet rozúčtu — krok za krokem

### Krok A — Kolik elektřiny vzal každý byt
Z podružek: `byt[i].VT`, `byt[i].NT`.

### Krok B — Náklad bytu, jako by VŠE koupil ze sítě (plná cena)
```
náklad_síť[i] = byt[i].VT × cena_VT + byt[i].NT × cena_NT
```
To je „kdyby FVE nebyla". Tahle částka je férový základ — odráží, KDY byt spotřebovává
(večerní VT špička stojí víc, proto soused s EV ve VT by platil víc).

### Krok C — FVE bonus (úspora) — JEN mezi vlastníky
Celková úspora domu z FVE = energie z FVE × (cena, za kterou by se jinak koupila ze sítě).
Protože FVE typicky kryje hlavně NT (baterie přes den → večer), ale i VT, použijeme
**váženou průměrnou cenu** podle skutečného poměru VT/NT v daném měsíci:

```
úspora_celkem = FVE_kWh_celkem × cena_průměr
```
Z úspory se nejdřív oddělí díl připadající na společnou spotřebu (§5) — ta ze slunce
čerpá taky a její FVE díl zlevňuje společnou položku všem třem bytům. **Zbytek**
(úspora připadající na byty) se NErozpouští přes všechny byty, ale jde podle
rozhodnutí **jen vlastníkům FVE** (Marek + soused), kteří ji pořídili:
```
úspora_bytů   = úspora_celkem × (Σ spotřeba bytů / spotřeba domu)
bonus[Marek]  = úspora_bytů × 50 %
bonus[soused] = úspora_bytů × 50 %
byt3 (nájemník): bonus = 0  → platí plnou síťovou cenu
```

⚠️ OTEVŘENÉ: Je „úspora" férově dělená 50/50, i když jeden vlastník (soused s EV) FVE
fyzicky spotřebuje víc? Dvě filozofie:
  (a) **50/50 podle vlastnictví** (= tvoje rozhodnutí) — vlastní investici dělí napůl bez ohledu na užití.
  (b) **podle reálné spotřeby FVE** — kdo víc čerpal ze slunce/baterie, víc bonusu.
→ Default (a). Appka umožní přepnout. Tohle je přesně to, co Marek řešil se sousedem a EV.

### Krok D — Měsíční fixy → rovným dílem na 3 byty
```
fix_na_byt = fixy_celkem × 1,21 (DPH) / 3
```
(I prázdný byt 3 platí svůj díl fixu — to je standardní, fix = připojení, ne spotřeba.)

⚠️ Standardně se fix dělí spíš podle velikosti jističe/podílu, ale rovným dílem na 3 byty
je transparentní a obhajitelný. Markovi nabídnout i variantu „podle spotřeby".

### Krok E — Výsledná platba bytu
```
platba[i] = (náklad_síť[i] − bonus[i]) × 1,21  +  fix_na_byt  [+ podíl_společné §5]
```

### Krok F — Příjem z přetoků (řeší se ROČNĚ, ne měsíčně!)
Výkup se zúčtovává 1× ročně (1.11.→31.10.), cena 900 Kč/MWh. Appka přetoky
měsíčně jen **eviduje** (akumuluje kWh), a při ročním zúčtování:
```
příjem_přetoky = Σ přetoky_rok × 900 Kč/MWh
výplata[Marek]  = příjem_přetoky × 50 %
výplata[soused] = příjem_přetoky × 50 %
```
Žádná „kasa domu" (zatím nezřízena) → jde přímo dvěma vlastníkům.

---

## 5. Společná spotřeba (chodby, sklep, čerpadlo, studna…) — POVINNÉ ✓

POTVRZENO z rozvaděče: dům má velkou společnou větev MIMO bytové podružky —
osvětlení (chodby, schodiště, sklep, garáž, fasáda, pergola), čerpadlo sklep, studna,
akvárium, venkovní zásuvky, zahradní domek, přímotop. Měří se jen 3 bytové podružky,
takže společná spotřeba = co dům spotřeboval navíc oproti součtu bytů.

```
spotřeba_celkem_dům = nákup_ze_sítě + FVE_kWh    (= spotřeba_domu ze SEMS)
společná_kWh = spotřeba_celkem_dům − Σ byty(VT+NT)
```
Společná spotřeba se ocení a rozdělí klíčem (default 1/3 na byt):
```
náklad_společná = společná_kWh × cena_průměr (VT/NT poměr) − případný FVE podíl
podíl_společné[i] = náklad_společná × klíč[i]   (default 1/3)
```

⚠️ OTEVŘENÉ pro Marka:
- Potvrdit, že společná větev opravdu visí jen na hlavním měřidle (žádná 4. podružka).
- Klíč na společnou: rovným dílem na 3 byty? Nebo podle podílu spotřeby? (default 1/3)

> VYŘEŠENO (implementováno): společná spotřeba FVE bonus **dostává**. Úspora z FVE se
> nejdřív rozdělí mezi (byty + společná) v poměru spotřeby; díl společné zlevní společnou
> položku všem třem bytům, a teprve bytová část úspory se přerozdělí mezi vlastníky 50/50.
> Společná spotřeba nemá vlastní VT/NT měření, proto se její poměr VT/NT přebírá z poměru
> bytů v daném měsíci.

---

## 6. Co appka vyprodukuje
- Tabulka na byt: spotřeba VT/NT, plný síťový náklad, FVE bonus, fix, společná, **výsledná platba**
- Přehled přetoků po zúčtovacích letech (1.11.→31.10.) + výplaty vlastníkům
- Tisk / PDF pro vyúčtování nájemníkovi bytu 3 (CSV zatím ne)
- Export/import JSON (záloha)
- Kontroly konzistence vstupů (žlutý panel): součet bytů ≤ spotřeba domu, nákup ≤ spotřeba,
  výroba ≈ FVE pokrytí + přetoky (±25 %, zbytek dělá baterie a ztráty), stav podružky neklesá

---

## 7. Otevřené body pro Marka (shrnutí ⚠️)
1. **Společná spotřeba** — měří 3 podružky celý dům, nebo jdou chodby/sklep mimo? (ověřit u rozvaděče)
2. **VT/NT na podružkách** — ukazují displeje CIT 372L dva registry (T1/T2), nebo jen součet?
3. **FVE bonus 50/50 vs podle reálné spotřeby** — filozofická volba (default 50/50 dle vlastnictví)
4. **Fixy** — rovným dílem na 3 byty OK? (default ano)
5. **Interní cena solární elektřiny pro byt 3 (nájemník)** — platí nájemník plnou síťovou cenu,
   nebo zvýhodněnou „solární"? (zatím: plnou, bonus = 0)

---

## 8. Mapování na kód (co je implementováno kde)

Výpočetní jádro je [src/calc.ts](src/calc.ts) (čistý TS, bez UI), testy [src/calc.test.ts](src/calc.test.ts):

| Model | Kód |
|---|---|
| §2 ceník + odvozené ceny VT/NT | `DEFAULT_TARIFF`, `pricesPerMWh()` |
| §3 FVE_kWh = spotřeba − nákup | `calculateBilling()` — `pvKwh` |
| §4 kroky A–E (síťový náklad, bonus, fixy, platba) | `calculateBilling()` — `rows` |
| §5 společná spotřeba + její FVE díl | `calculateBilling()` — `commonKwh`, jednotka `common` |
| §4F / přetoky ročně | `calculateFeedIn()` + seskupení po letech v [src/main.ts](src/main.ts) |
| §3 kontrolní rovnosti | `checkConsistency()` |
| dohoda (vlastníci, podíly, klíče) | `DEFAULT_AGREEMENT` — v UI jen ke čtení, změna přes JSON export/import |

**Známá aproximace:** FVE úspora i společná spotřeba se oceňují váženou průměrnou
cenou podle poměru VT/NT spotřeby celého domu (SEMS neumí říct, kolik FVE energie šlo
do VT vs NT oken). Součet plateb bytů proto vychází o <1 % jinak než faktura innogy
(duben 2026: 5 704 vs 5 666 Kč). Na poměry mezi byty to nemá vliv, jen na absolutní
součet. Přesnější by bylo znát VT/NT rozpad nákupu ze sítě z faktury — případné
budoucí vylepšení: zadávat z faktury VT a NT nákup zvlášť.

**Vzorový výpočet na reálných číslech (duben 2026)** je v [NAVOD.md](NAVOD.md).
