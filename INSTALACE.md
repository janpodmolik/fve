# Instalace na novém počítači (macOS)

Jak projekt rozjet na počítači, kde ještě nic není. Počítá se s macOS; poznámka k Windows je na konci.

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
