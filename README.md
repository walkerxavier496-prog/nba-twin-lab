# NBA Twin Lab V3 — Advanced statistical twins

An independent, open-source NBA statistical similarity explorer, built for GitHub Pages. The **advanced 18-feature model** compares player style, not talent. The original 13-feature model is also available. Supports career, peak-three, best-season, and direct player-vs-player comparison.

## Data status

**Never infer freshness from today's date.** The interface displays the latest verified complete season and separately labels incomplete/provisional seasons. A published `data/seasons.json` is required; the website refuses to invent data when the import fails. The historical mirror's 2025–26 rows were last checked in April 2026 and **must not be called a completed 2025–26 season** unless the upstream snapshot is updated. NBA official current-season ingestion is attempted but may be blocked by the provider. The importer preserves the last valid dataset if a new build fails.

## Data sources and provenance

- [Basketball Reference historical CSV mirror](https://github.com/sumitrodatta/bball-reference-datasets) — advanced, per-100-possession, totals, and player biographical information; primary input. Verify the upstream repository's reuse rights and site terms before republishing large datasets.
- [SpecCRA historical scrape](https://github.com/SpecCRA/nba_data_scrapers) — independently cross-checks and fills missing historical features, where available.
- [NBA Height/Weight](https://github.com/simonwarchol/NBA-Height-Weight) — height supplement, matched by normalized player name where stable IDs are unavailable.
- [Official NBA Stats](https://www.nba.com/stats) — attempted for the current NBA season. **OBPM, DBPM, and Basketball Reference TOV% are not provided by this feed**; these values remain missing rather than being substituted with unrelated statistics.

`data/seasons.json` includes upstream source links, the primary source's last commit date, attempted current season, import warnings, season completeness, and per-player `source` and `provisional` fields. **Different data providers may use slightly different definitions.** Only compatible metrics are joined. Data usage and source terms remain the responsibility of the project owner.

## Model

The 18 metrics are points per 100 possessions, TS%, usage%, FTr, 3PAr, AST%, TOV%, TRB%, BLK%, listed height, STL%, DBPM, OBPM, ORB%, DRB%, 3P%, 2P%, FT%. The classic model uses the original 13.

1. Select a single combined-team record per player and season to avoid double counting traded players.
2. Within each NBA season, convert each observed metric to its midrank percentile, requiring at least 35 observed players for that metric.
3. Calculate each player's career fingerprint as the **minutes-weighted mean of each metric's available season percentiles**. Peak-three and best-year choose seasons by BPM when available.
4. Calculate weighted RMS Euclidean distance over **observed, shared metrics only**. The advanced model gives each broad statistical category equal aggregate weight so that eight shooting metrics do not drown out the other categories. Require at least 12 shared metrics (or 12 of 13 in classic) and 70% of the total metric weight. Add a small penalty for missing coverage. Lower is closer, **not a percentage of similarity or skill rating**.
5. Incomplete current-season data are **off by default**. Users may explicitly opt in.

Historical era adjustment is percentile-based, not pace or competition-adjusted beyond each season's ranking. Height is a physical trait, not a performance score. Correlated metrics and cross-source definitions can affect matches. Identically named players across eras may require manual identity disambiguation.

## Run and test locally

```bash
python -m pip install -r requirements.txt pytest
pytest -q
python build_data.py             # full import, including optional current NBA source
python build_data.py --no-current # verified historical-only import
python -m http.server 8000
# open http://localhost:8000
```

## Publish with GitHub Pages

The repository contains a daily GitHub Actions workflow, **Validate and refresh NBA Twin Lab data**, which tests and imports source data and commits `data/seasons.json` only after successful validation. It also runs on relevant code changes and can be started manually from the **Actions** tab.

In **Settings → Pages**, choose **Deploy from a branch**, select **main** and **/(root)**, then **Save**. The site URL will be:

https://walkerxavier496-prog.github.io/nba-twin-lab/

If the Actions workflow fails, read its log before claiming the latest season is current. If the repository's workflow permissions prevent the bot from pushing the generated JSON, allow **Read and write permissions** under **Settings → Actions → General** or use a deployment token approved for the repository.

## Maintainer notes

This is an independent fan analytics project, not affiliated with or endorsed by the NBA, Basketball Reference, or the source maintainers. Source statistics are credited and the interface is designed to be transparent about coverage and limitations. See `tests/` for synthetic, network-free parser tests.