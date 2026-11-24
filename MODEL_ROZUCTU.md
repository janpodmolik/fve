# Model rozúčtu FVE — logika výpočtu

> Rozkresluje, jak appka spočítá rozúčet elektřiny mezi 3 byty.
> Postaveno na reálných cenách z faktury innogy 04/2026 a na rozhodnutích z června 2026.
> **Stav: IMPLEMENTOVÁNO** v [src/calc.ts](src/calc.ts) podle §4 + §5 (viz §8 — mapování na kód).
> Návod k obsluze pro laika: [NAVOD.md](NAVOD.md). Body označené ⚠️ jsou otevřené otázky dohody mezi vlastníky.

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
- `vlastníci_FVE` = [byt1, byt2] — kdo dostává FVE bonus a přetoky (kdo v kterém bytě bydlí, řeší soukromá složka `dum/`, ne tenhle dokument)
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

> Pozn.: appka může pracovat s/bez DPH — odběratel je fyzická osoba, takže koncové částky pro byty počítáme **s DPH** (×1,21), protože tolik reálně platí.

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
(večerní VT špička stojí víc, takže i spotřeba ve VT vyjde dráž).

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
rozhodnutí **jen vlastníkům FVE** (byt 1 + byt 2), kteří ji pořídili:
```
úspora_bytů   = úspora_celkem × (Σ spotřeba bytů / spotřeba domu)
bonus[byt1] = úspora_bytů × 50 %
bonus[byt2] = úspora_bytů × 50 %
byt3 (nevlastní FVE): bonus = 0  → platí plnou síťovou cenu
```

⚠️ OTEVŘENÉ: Je „úspora" férově dělená 50/50, i když jeden vlastník FVE
fyzicky spotřebuje víc (např. nabíjí elektroauto)? Dvě filozofie:
  (a) **50/50 podle vlastnictví** (= zvolené řešení) — vlastní investici dělí napůl bez ohledu na užití.
  (b) **podle reálné spotřeby FVE** — kdo víc čerpal ze slunce/baterie, víc bonusu.
→ Platí (a). Přepínač na (b) v appce není.

### Krok D — Měsíční fixy → rovným dílem na 3 byty
```
fix_na_byt = fixy_celkem × 1,21 (DPH) / 3
```
(I prázdný byt 3 platí svůj díl fixu — to je standardní, fix = připojení, ne spotřeba.
Byt označený v daném období jako neobsazený (`vacant`) jen nenese podíl na společné
spotřebě; ta se dělí mezi obsazené byty.)

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
výplata[byt1] = příjem_přetoky × 50 %
výplata[byt2] = příjem_přetoky × 50 %
```
Žádná „kasa domu" (zatím nezřízena) → jde přímo dvěma vlastníkům.

---

## 5. Společná spotřeba (společné prostory a garáž) — POVINNÉ ✓

Dům má společnou větev mimo bytové podružky: společné prostory a garáž. Měří se jen
3 bytové podružky, takže společná spotřeba = co dům spotřeboval navíc oproti součtu bytů.
Co přesně na společné větvi je a kolik který spotřebič bere, změřené není.

```
spotřeba_celkem_dům = nákup_ze_sítě + FVE_kWh    (= spotřeba_domu ze SEMS)
společná_kWh = spotřeba_celkem_dům − Σ byty(VT+NT)
```
Společná spotřeba se ocení a rozdělí klíčem (default 1/3 na byt):
```
náklad_společná = společná_kWh × cena_průměr (VT/NT poměr) − případný FVE podíl
podíl_společné[i] = náklad_společná × klíč[i]   (default 1/3)
```

Společná větev nemá vlastní elektroměr. Dělí se rovným dílem mezi byty; byt vedený
v daném období jako neobsazený (`vacant`) se na ní nepodílí (stálé platby platí dál).
Na společné větvi jsou i garážové zásuvky. Spotřeba z nich se zatím dělí stejně jako
ostatní společná spotřeba; samostatně půjde účtovat, až bude mít garáž vlastní měřák.

> VYŘEŠENO (implementováno): společná spotřeba FVE bonus **dostává**. Úspora z FVE se
> nejdřív rozdělí mezi (byty + společná) v poměru spotřeby; díl společné zlevní společnou
> položku všem třem bytům, a teprve bytová část úspory se přerozdělí mezi vlastníky 50/50.
> Společná spotřeba nemá vlastní VT/NT měření, proto se její poměr VT/NT přebírá z poměru
> bytů v daném měsíci.

---

## 6. Co appka vyprodukuje
- Tabulka na byt: spotřeba VT/NT, plný síťový náklad, FVE bonus, fix, společná, **výsledná platba**
- Přehled přetoků po zúčtovacích letech (1.11.→31.10.) + výplaty vlastníkům
- Tisk / PDF vyúčtování za měsíc; tabulky CSV a Markdown dělá `npm run vyuctovani`
- Export/import JSON (záloha)
- Kontroly konzistence vstupů (žlutý panel): součet bytů ≤ spotřeba domu, nákup ≤ spotřeba,
  výroba ≈ FVE pokrytí + přetoky (±25 %, zbytek dělá baterie a ztráty), stav podružky neklesá

---

## 7. Otevřené body dohody (shrnutí ⚠️)
1. **FVE bonus 50/50 vs podle reálné spotřeby** — volba vlastníků (platí 50/50 podle vlastnictví).
2. **Stálé platby** — rovným dílem na 3 byty (platí; alternativa by byla podle jističe nebo podílu).
3. **Cena solární elektřiny pro byt, který FVE nevlastní** — platí plnou síťovou cenu, bonus = 0.
4. **Garáž jako samostatně měřená jednotka** — až bude měřák; včetně toho, za kolik účtovat
   energii z přebytků a za kolik energii ze sítě.

Vyřešeno dřív: společná větev jde mimo podružky a nemá vlastní elektroměr; podružky CIT 372L
mají dva registry (T1/T2).

---

## 8. Mapování na kód (co je implementováno kde)

Výpočetní jádro je [src/calc.ts](src/calc.ts) (čistý TS, bez UI), testy [src/calc.test.ts](src/calc.test.ts):

| Model | Kód |
|---|---|
| §2 ceník + odvozené ceny VT/NT | `DEFAULT_TARIFF`, `pricesPerMWh()` |
| §3 FVE_kWh = spotřeba − nákup | `calculateBilling()` — `pvKwh` |
| §4 kroky A–E (síťový náklad, bonus, fixy, platba) | `calculateBilling()` — `rows` |
| §5 společná spotřeba + její FVE díl | `calculateBilling()` — `commonKwh`, jednotka `common` |
| §4F / přetoky ročně | `feedInByYear()` — po zúčtovacích letech, až od začátku výkupu (`agreement.feedInFrom`) |
| §3 kontrolní rovnosti | `checkConsistency()` |
| dohoda (vlastníci, podíly, klíče) | `DEFAULT_AGREEMENT` — v UI jen ke čtení, změna přes JSON export/import |

**Známá aproximace:** FVE úspora i společná spotřeba se oceňují váženou průměrnou
cenou podle poměru VT/NT spotřeby celého domu (SEMS neumí říct, kolik FVE energie šlo
do VT vs NT oken). Součet plateb bytů proto vychází o <1 % jinak než faktura innogy
(duben 2026: 5 704 vs 5 666 Kč). Na poměry mezi byty to nemá vliv, jen na absolutní
součet. Přesnější by bylo znát VT/NT rozpad nákupu ze sítě z faktury — případné
budoucí vylepšení: zadávat z faktury VT a NT nákup zvlášť.

**Vzorový výpočet na reálných číslech (duben 2026)** je v [NAVOD.md](NAVOD.md).
