# Instalace na novém počítači (macOS)

Jak projekt rozjet na počítači, kde ještě nic není. Počítá se s macOS; poznámka k Windows je na konci.

## Rychlá cesta: nech to udělat agenta

Stačí mít na počítači AI agenta (Codex nebo Claude Code) a ve složce Stažené zip s daty domu (`dum-RRRR-MM-DD.zip`). Agenta otevři v libovolné složce a vlož mu tenhle text. Sám zjistí, co chybí, řekne, co nainstalovat, stáhne projekt, rozbalí data a ověří, že všechno běží.

````text
Zprovozni mi na tomhle Macu projekt „FVE rozúčet". Postupuj po krocích a po každém mi krátce řekni, co jsi zjistil nebo udělal.

1. Zjisti, co je nainstalované: `git --version`, `python3 --version`, `node --version` a jestli je ve složce /Applications Google Chrome nebo Microsoft Edge. Zatím nic neinstaluj.

2. Co chybí, mi vypiš a řekni přesně, co mám udělat já (instalace chtějí moje potvrzení nebo heslo):
   - chybí git nebo python3 → v Terminálu pustit `xcode-select --install` a potvrdit dialog
   - chybí node nebo je starší než verze 20 → nainstalovat LTS instalátorem z https://nodejs.org
   - chybí Chrome i Edge → nainstalovat Chrome
   Počkej, až napíšu, že je hotovo, a pak to zkontroluj znovu.

3. Stáhni projekt: `git clone https://github.com/janpodmolik/fve.git ~/Projekty/fve` (složku ~/Projekty vytvoř, když není). Repo je veřejné, účet na GitHubu není potřeba. Když už ~/Projekty/fve existuje, neklonuj znovu a udělej v ní jen `git pull`.

4. Ve složce ~/Projekty/fve pusť `npm install`.

5. Najdi zip s daty domu: soubor `dum-*.zip` ve složce ~/Downloads. Když jich je víc, vezmi nejnovější a řekni mi který. Když tam žádný není, zeptej se mě na cestu. Rozbal ho z ~/Projekty/fve příkazem `python3 scripts/balicek.py rozbal <cesta k zipu>`.

6. Ověř, že všechno běží (z ~/Projekty/fve):
   - `npm run rozuct`
   - `npm run vyuctovani`
   - `python3 dum/skripty/kontrola.py` (má skončit větou „Datové soubory spolu sedí.")
   - `python3 dum/skripty/podklad-soused.py`
   Pak otevři `dum/vystupy/podklad-soused.pdf` příkazem `open`.

7. Přečti si `AGENTS.md` a `dum/AGENTS.md` a shrň mi ve čtyřech pěti větách, co o domě víš a co ve složce `dum/` je.

Pravidla:
- Nic necommituj a nepushuj.
- Nic neinstaluj sám přes sudo a nestahuj ani nespouštěj instalační skripty z internetu. Instalace nech na mně podle kroku 2.
- Mimo složku ~/Projekty/fve nic neměň a nemaž.
- Když některý krok selže, zastav se a napiš mi přesnou chybu. Neobcházej ji.

Až bude hotovo, řekni mi, ať si agenta příště otevřu přímo ve složce ~/Projekty/fve.
````

Účet na GitHubu k tomu není potřeba, repo je veřejné a nic se do něj neposílá. Po dokončení agenta zavři a příště ho otevři přímo ve složce `~/Projekty/fve`, aby si pokyny z `AGENTS.md` načetl sám.

Zbytek tohohle souboru je tentýž postup ručně, pro případ, že by agent někde uvízl.

## Co je potřeba nainstalovat

| Co | K čemu | Jak | Ověření |
|---|---|---|---|
| **Xcode Command Line Tools** | dá `git` a `python3` | v Terminálu `xcode-select --install` a potvrdit dialog (5–10 minut) | `git --version` a `python3 --version` |
| **Node.js** (LTS, verze 20 nebo novější) | výpočet rozúčtu, tabulky, lokální appka; obsahuje `npm` | instalátor `.pkg` z https://nodejs.org | `node --version` |
| **Chrome** nebo **Edge** | tvorba PDF | běžná instalace, pokud tam ještě není | stačí, že je ve složce Aplikace |
| **AI agent** | práce se složkou | Codex (stačí předplatné ChatGPT) nebo Claude Code; jeden z nich | viz „Agent" níže |

Systémový Python z Command Line Tools (3.9) stačí, nic dalšího se do Pythonu neinstaluje. Homebrew potřeba není.

## Postup

Složku dej mimo iCloud (ne na Plochu ani do Dokumentů, pokud se synchronizují): tisíce drobných souborů v `node_modules` iCloud zbytečně zatíží.

```bash
mkdir -p ~/Projekty && cd ~/Projekty
git clone https://github.com/janpodmolik/fve.git
cd fve
npm install
```

Soukromá data domu nejsou na GitHubu. Přijdou jako zip a rozbalí se do složky `dum/`:

```bash
python3 scripts/balicek.py rozbal ~/Downloads/dum-RRRR-MM-DD.zip
```

## Ověření, že všechno běží

```bash
npm run rozuct                          # vypíše vyúčtování po měsících
npm run vyuctovani                      # zapíše tabulky do dum/vystupy/
python3 dum/skripty/kontrola.py         # „Datové soubory spolu sedí."
python3 dum/skripty/podklad-soused.py   # vytvoří PDF
open dum/vystupy/podklad-soused.pdf
```

Když tyhle čtyři příkazy projdou a PDF se otevře, je hotovo.

## Agent

Otevři v agentovi **celou složku `fve`**, ne jen `dum/`.

- **Codex** čte `AGENTS.md` sám. V kořeni je obecný, v `dum/` kontext domu.
- **Claude Code** čte `CLAUDE.md`, který oba soubory načte.

Agent bude chtít pouštět příkazy `npm` a `python3` a zapisovat do složky `dum/`. To mu povol. Commit a push nepovoluj.

První zpráva na zkoušku:

> Přečti si AGENTS.md a dum/AGENTS.md a řekni mi, co o domě a o stavu domluvy se sousedem víš.

## Lokální appka (volitelné)

Appka běží na webu (https://janpodmolik.github.io/fve/), lokálně ji pouštět není potřeba. Hodí se jen na vyzkoušení změny kódu dřív, než půjde na web:

```bash
npm run dev
```

Otevře se na adrese, kterou příkaz vypíše (obvykle http://localhost:5173). Lokální appka má vlastní prázdné úložiště, takže si do ní data nahraj přes Nastavení → Import JSON → `dum/data/appka.json`.

## Aktualizace a záloha

```bash
git pull && npm install      # nová verze appky a skriptů; složky dum/ se nedotkne
```

Složka `dum/` existuje jen na tomhle počítači. Občas ji zkopíruj jinam, nebo ji zabal: `python3 scripts/balicek.py zabal` vytvoří zip ve složce `predani/`.

## Když něco nejde

| Hláška nebo problém | Co s tím |
|---|---|
| `python3` vyvolá dialog o instalaci vývojářských nástrojů | potvrdit, jsou to Command Line Tools |
| „Nenašel jsem Chrome ani Edge" | nainstalovat Chrome, nebo HTML otevřít v prohlížeči a dát Tisk → Uložit jako PDF |
| `npm install` skončí chybou o verzi Node | nainstalovat aktuální LTS z nodejs.org |
| `git pull` odmítne kvůli místním změnám | agent upravil sledovaný soubor; `git status` ukáže který, `git stash` změnu odloží |
| `npm run rozuct` nenajde data | chybí složka `dum/`, rozbal zip (viz Postup) |

## Windows

Mělo by fungovat stejně s `python` místo `python3` a s Gitem a Pythonem z jejich instalátorů. Vyzkoušené to není.
