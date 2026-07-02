# Návod k použití — FVE rozúčet

> Návod pro běžného uživatele (žádné programování). Vysvětluje, **co kam zadat,
> odkud čísla vzít a jak číst výsledek**. Jak přesně se počítá, popisuje
> [MODEL_ROZUCTU.md](MODEL_ROZUCTU.md).
>
> **Tentýž návod je i přímo v aplikaci** pod tlačítkem **📖 Návod** vpravo
> nahoře — uživatel tenhle soubor nepotřebuje. Při úpravách udržuj obě verze
> v souladu (v kódu je to `renderHelp()` v [src/main.ts](src/main.ts)).

## Co appka dělá

Jednou měsíčně do ní opíšeš **10 čísel** (4 ze SEMS+ aplikace a 6 z elektroměrů
v rozvaděči) a ona spočítá, **kolik má který byt zaplatit za elektřinu** — včetně
férového zohlednění toho, že fotovoltaiku vlastní jen Byt 1 a Byt 2.

**Důležité:** všechna data jsou uložena **jen v tomto prohlížeči na tomto
počítači**. Nikam se neposílají. Proto po každém zadaném měsíci klikni na
**Export JSON (záloha)** a soubor si někam ulož (viz [Zálohování](#zálohování)).

**Chceš si to nejdřív jen prohlédnout?** Klikni nahoře na **🎬 Ukázka** —
appka se naplní reálnými čísly z dubnové faktury a modrý panel tě provede tím,
co které číslo znamená a kolik kdo platí. Nic se při tom neukládá a tvoje
data zůstanou netknutá; ukázku ukončíš tlačítkem v modrém panelu.

---

## Měsíční rutina (5 kroků, ~10 minut)

**Nejjednodušší cesta: klikni nahoře na 🧭 Průvodce měsícem** — provede tě
všemi kroky níže po jednom (období → SEMS+ → podružky → kontrola a výsledek)
a na konci připomene zálohu. Zbytek téhle kapitoly popisuje totéž pro případ,
že zadáváš přímo na hlavní stránce.

Dělej vždy ke stejnému dni v měsíci (např. vždy 1. den v měsíci ráno).

### 1. Založ nový měsíc
Klikni na **+ Nový měsíc** a potvrď období (formát `2026-07` = červenec 2026).

### 2. Opiš 4 čísla ze SEMS+ (celý dům)
V aplikaci/portálu SEMS (GoodWe, přihlášení účtem k FVE) otevři
**Statistiky → měsíční přehled** za minulý měsíc a opiš:

| Pole v appce | V SEMS+ se jmenuje | Co to je |
|---|---|---|
| Výroba FVE | „Výroba" | co panely vyrobily |
| Spotřeba domu | „Spotřeba" / „Zatížení" | co celý dům spotřeboval |
| Přetoky do sítě | „Do sítě" / „Prodej" | co se prodalo do sítě |
| Nákup ze sítě | „Ze sítě" / „Nákup" | co se koupilo (to je na faktuře) |

Všechno v kWh. U každého pole je v appce ikonka **ⓘ** s nápovědou.

### 3. Opiš 6 stavů z podružných elektroměrů
V rozvaděči jsou 3 elektroměry CIT 372L (jeden na byt: 1.N.P, 2.N.P, 3.N.P).
Tlačítkem na měřidle přepínáš displej mezi **T1 (= VT, vysoký tarif)** a
**T2 (= NT, nízký tarif)**. Opiš oba stavy pro každý byt.

**Zadávej STAV měřidla (to velké kumulativní číslo), ne spotřebu!**
Appka si spotřebu spočítá sama jako rozdíl proti minulému měsíci.

Vyplň i **datum odečtu** (předvyplní se dnešek) — zdokumentuje, ke kterému dni
stavy platí, a tiskne se na vyúčtování.

### 4. Zkontroluj, jestli nesvítí žlutý panel „Kontrola dat"
Appka porovnává čísla mezi sebou (např. součet bytů nesmí být větší než spotřeba
domu). Když něco nesedí, ukáže žluté upozornění s vysvětlením — v tom případě
zkontroluj, jestli ses neupsal.

### 5. Přečti výsledek a zazálohuj
Tabulka **Rozpis na byt** ukazuje, kolik má kdo zaplatit. Přes **Tisk / PDF** ji
můžeš uložit nebo poslat. Nakonec **Export JSON (záloha)**.

---

## První použití (jen jednou)

První kolo je **„nultý odečet"**: zapíšou se počáteční stavy podružek, ale
vyúčtování ještě nevznikne — není s čím porovnávat. Skutečné vyúčtování
uvidíš až u druhého zadaného měsíce. Průvodce tě na to sám upozorní.

1. Spusť 🧭 Průvodce a založ měsíc **předcházející** prvnímu, který chceš
   účtovat (např. účtuješ od července → založ `2026-06`).
2. Zadej **stavy podružek** (počáteční odečet). Krok se SEMS čísly průvodce
   u nultého měsíce rovnou přeskočí — pro vyúčtování se nepoužijí. Výjimka:
   „Přetoky do sítě" se počítají do ročního součtu výkupu, takže pokud už
   běží výkup, doplň je pak na hlavní stránce.
3. Příští měsíc už normálně projdeš průvodce celý — a dostaneš první rozpis.

**Kdy začít? Kterýkoli den — nic se nerozbije.** Nultý odečet můžeš udělat
klidně dnes, i když je třeba 9. v měsíci. Jediný háček: první vyúčtovaný měsíc
bude mírně nepřesný. SEMS+ totiž počítá celé kalendářní měsíce, ale podružky
měří až od tvého prvního odečtu — spotřebu bytů od 1. dne měsíce do dne odečtu
tak appka nedokáže rozdělit na byty a spadne do společné spotřeby (dělí se na
třetiny). Je to jednorázová drobnost prvního měsíce, od druhého už čísla sedí
přesně. **Do budoucna pak odečítej vždy k 1. dni měsíce** (třeba ráno), ať se
stavy podružek kryjí s měsíčními čísly ze SEMS+. Kdo chce úplně čistý start,
udělá nultý odečet kdykoli a ostré účtování začne od nejbližšího 1. dne.

---

## Jak číst tabulku „Rozpis na byt"

| Sloupec | Význam |
|---|---|
| **Spotřeba** | co byt reálně spotřeboval podle své podružky (VT + NT) |
| **Síť** | kolik by ta spotřeba stála, kdyby se **všechno** kupovalo ze sítě za ceny z faktury |
| **− FVE bonus** | sleva za elektřinu ze slunce/baterie — dostávají ji **jen vlastníci FVE** (Byt 1 + Byt 2, každý polovinu) |
| **+ Společná** | podíl bytu (⅓) na spotřebě společných prostor — chodby, sklep, čerpadlo, studna, akvárium… (nemají vlastní elektroměr, dopočítává se) |
| **+ Fix** | podíl bytu (⅓) na stálých měsíčních platbách z faktury (platí se i při nulové spotřebě — je to cena za přípojku, ne za elektřinu) |
| **= Platba** | výsledná částka za měsíc, **včetně DPH 21 %** |

Nad tabulkou jsou tři štítky:
- **FVE pokrytí** — kolik kWh dům odebral ze slunce/baterie místo ze sítě,
- **Společná spotřeba** — kolik kWh šlo mimo bytové podružky,
- **FVE úspora celkem** — kolik Kč dům díky FVE ušetřil (bez DPH).

### Proč Byt 3 neplatí míň, když taky svítí ze slunce?
Byt 3 není vlastník FVE, takže platí **plnou síťovou cenu** za všechno, co
spotřeboval. Rozdíl (to, co by jinak stála elektřina, kterou dostal z FVE) je
právě ten bonus, který si rozdělí vlastníci — tak se jim vrací investice.
Tohle je dohoda, ne vlastnost výpočtu; dá se změnit (viz níže).

### Součet plateb ≈ faktura, ne přesně
Součet plateb všech bytů vyjde o ~1 % jinak než faktura innogy. Je to tím, že
appka oceňuje FVE elektřinu **průměrnou cenou** podle poměru VT/NT celého domu,
zatímco faktura má přesný poměr jen pro nakoupenou část. Na férovost rozdělení
to nemá vliv.

---

## Vzorový příklad (reálná čísla, duben 2026)

**Vstupy:** dům spotřeboval 1 756 kWh, ze sítě koupil 1 256 kWh, panely vyrobily
800 kWh, přetoky 171 kWh. Byty podle podružek: Byt 1 = 460 kWh, Byt 2 = 740 kWh,
Byt 3 = 50 kWh.

**Co appka dopočítá:**
- FVE pokrytí: 1 756 − 1 256 = **500 kWh** zadarmo ze slunce/baterie
- Společná spotřeba: 1 756 − (460+740+50) = **506 kWh**
- FVE úspora: 500 kWh × průměrná cena 2,93 Kč/kWh = **1 464 Kč** (bez DPH).
  Z toho část připadá na společnou spotřebu; zbytek (**1 042 Kč**) je bonus
  bytů → po přičtení DPH dostane každý vlastník slevu **631 Kč**.

**Výsledek (s DPH):**

| Byt | Síť | − bonus | + společná | + fix | = Platba |
|---|---|---|---|---|---|
| Byt 1 (vlastník) | 1 622 | −631 | 427 | 418 | **1 837 Kč** |
| Byt 2 (vlastník) | 2 629 | −631 | 427 | 418 | **2 844 Kč** |
| Byt 3 | 178 | — | 427 | 418 | **1 023 Kč** |
| **Celkem** | | | | | **5 704 Kč** (faktura: 5 666 Kč) |

---

## Přetoky (prodej do sítě)

Peníze za prodanou elektřinu jsou **oddělené od měsíčních plateb bytů** — patří
jen vlastníkům FVE (50/50). Innogy je vyplácí **jednou ročně** za období
1. 11. → 31. 10. Appka přetoky průběžně sčítá po zúčtovacích letech a ukazuje
orientační výplatu; po ročním vyúčtování od innogy čísla porovnej.

Pozor: výkup běží až od 14. 5. 2026 (TZVP) — přetoky před tímto datem se
neproplácejí, i když je appka eviduje.

---

## Nastavení — kdy do něj sahat

Sekce **Nastavení — ceník a dohoda** (rozklikávací dole):

- **Ceník** je přednastavený z faktury innogy 04/2026. Měnit ho budeš jen když
  přijde nová faktura s jinými cenami (změna ceníku innogy — nejdřív 2028, nebo
  změna regulovaných cen distribuce — obvykle k 1. 1.). Opiš hodnoty z faktury
  **bez DPH**.
- **Každý měsíc si pamatuje svůj ceník.** Když ceny změníš, platí to jen pro
  nově založené měsíce — už spočítaná vyúčtování se zpětně nezmění. Pokud má
  nový ceník platit i pro právě zobrazený měsíc (třeba ses při zadávání spletl),
  v Nastavení se objeví žluté upozornění s tlačítkem „Použít aktuální ceník
  pro …" — tím ho vědomě přepíšeš.
- **Dohoda** (kdo vlastní FVE, podíly 50/50, dělení fixů a společné na třetiny)
  se v appce jen zobrazuje. Změna: **Export JSON → upravit sekci `agreement`
  v textovém editoru → Import JSON**. To je záměr — dohoda se mění jednou za
  roky a omylem přepsané číslo by tiše pokazilo všechna vyúčtování.

---

## Zálohování

- **Export JSON** stáhne **vždy úplně všechno** — celou historii všech měsíců
  včetně jejich ceníků, dohodu i aktuální ceník. Není to záloha jednoho měsíce;
  poslední stažený soubor ti stačí k obnově celé appky. Ulož si ho na
  Disk/e-mail po každém měsíci.
- **Import JSON** vše obnoví — na stejném i jiném počítači (tak se appka
  „přenáší" na jiné zařízení).
- Data zmizí, když v prohlížeči smažeš „data webů" — proto zálohuj. Když je
  poslední záloha starší než měsíc (nebo žádná není), appka to sama připomene
  žlutým proužkem nahoře.
- **🗑️ Smazat měsíc** (vedle výběru období) smaže jen zobrazený měsíc — hodí
  se, když něco špatně naklikáš a chceš měsíc zadat znovu. Spotřeba
  následujícího měsíce se pak počítá proti nejbližšímu staršímu odečtu.
- **Smazat všechna data** (dole) maže opravdu vše a nejde vrátit.

---

## Časté situace

**Něco jsem špatně naklikal a chci to vzít zpátky.** Smaž jen ten jeden měsíc
tlačítkem „🗑️ Smazat měsíc" a zadej ho znovu (klidně průvodcem). Ostatní
měsíce zůstanou. Jednotlivá čísla jdou samozřejmě i jen přepsat.

**Zadal jsem stav a spotřeba je 0.** Buď je to první měsíc (chybí předchozí
odečet), nebo je zadaný stav nižší než minule (překlep — appka na to upozorní
žlutým panelem).

**Žlutý panel hlásí, že součet bytů je vyšší než spotřeba domu.** Někde je
chyba v opisování — porovnej stavy podružek s minulým měsícem a hodnotu
„Spotřeba domu" ze SEMS+.

**Byt je prázdný, má platit?** Ano — svůj díl fixů a společné spotřeby (v dubnu
cca 850 Kč). Fix je platba za přípojku, ne za odběr; chodba svítí a čerpadlo
běží i pro prázdný byt.

**Přeskočil jsem měsíc.** Nevadí — spotřeba se počítá jako rozdíl stavů proti
poslednímu zadanému měsíci, takže se nic neztratí; jen bude v jednom vyúčtování
spotřeba za dva měsíce (ale fix se započítá jen jednou, takže měsíc raději
nepřeskakuj).
