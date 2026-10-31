# NBA Twin Lab media and score provenance

NBA Twin Lab is an independent NBA analysis project. It is **not affiliated with, endorsed by or sponsored by the NBA, its teams or ESPN**.

## Which visuals belong on each screen?

- **Game cards and scoreboard:** show only the actual two teams in the game using team logos carried by the NBA schedule/results feed. Real scores are never replaced by projections.
- **Featured matchup:** show those two team logos plus the actual player headshots from the selected game's frozen, conditional player-stat forecast. Photos are marked as player portraits and never presented as live action photographs from the game.
- **Player-stat lab:** show a player's named NBA headshot only alongside a forecast for that same player. Missing headshots retain an explicit placeholder.
- **No arbitrary historic courts, Olympics images or unrelated player photos.** Three previous promotional photos were removed because they confused visitors about the matchup being shown.

## Real scoreboard

`assets/live-scoreboard.js` fetches ESPN's public unofficial NBA scoreboard: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD&limit=100`.

- `scheduled`: display pregame time and **no invented score**.
- `live`: display the actual score, period and game clock from the retrieved scoreboard, labelled **ESPN LIVE**.
- `final`: display the actual final score, labelled **ESPN FINAL**.
- Refresh the publicly sourced game state every 60 seconds, annotate the last successful refresh, and never call an older snapshot *live* when a request fails.
- Score retrieval is entirely separate from the immutable prediction-lock source and does not affect win probabilities or projected player statistics.
- CORS, outages, undocumented provider changes and transient source failures can prevent live scores appearing. In that case the site shows scores unavailable or the original locked forecast, rather than manufacturing scores.

## Team marks and player portraits

All 30 team logo URLs in `assets/team-media.js` were copied from the feed's `data/games.json`. They are hosted by ESPN (`a.espncdn.com`); team names and logos remain the marks of their respective owners.

NBA player images come from NBA's public headshot CDN using the exact **NBA player ID** in each matching frozen player projection: `https://cdn.nba.com/headshots/nba/latest/260x190/<NBA_PLAYER_ID>.png`. Missing photos have a safe fallback.

Public availability does **not** automatically grant permission for commercial reproduction or redistribution. Before monetisation, advertising or commercial use, check NBA/ESPN provider terms and secure rights/authorisation as necessary. Do not represent the site as an official NBA product. No logos or headshots are covered by Wikimedia Creative Commons licences.
