# NBA Twin Lab — locked pregame practice forecast

**Locked:** Saturday, 31 October 2026 at 8:49:42 am AEDT (2026-10-30T21:49:42.885Z)  
**Repository commit:** `a1690c146d61c900ea6a50121c3d57399da2b95a`  
**Canonical forecast SHA-256:** `f3b82c10744ed6fba16b40146f60f4db372ad4dc33d8e4f1f1cb9be3cb1e96ed`  
**Scope:** all 10 NBA games played Saturday 31 October 2026 in Melbourne (Friday 30 October in the US). Every lock precedes tipoff.

The primary game forecast is the repository's production Elo baseline. Roster-aware beta and 100,000-simulation possession Monte Carlo are retained as diagnostics, not substituted after the fact. V9 player numbers are conditional on playing and use the exact live-page matchup adjustment. The 5:15 p.m. ET official NBA injury report is a sidecar only and did not alter any model output.

## Game forecast ledger

| Tip (AEDT) | Matchup | Locked pick | Win p | Elo score (A-H) | MC home p | Roster-beta home p |
|---|---|---:|---:|---:|---:|---:|
| 10:00 am | CHA @ WSH | **CHA** | 79.3% | 117.8–110.0 | 39.8% | 26.3% |
| 10:30 am | CHI @ BOS | **BOS** | 90.8% | 109.3–122.5 | 72.4% | 90.1% |
| 10:30 am | DET @ BKN | **DET** | 86.8% | 118.2–107.3 | 31.8% | 16.2% |
| 10:30 am | NY @ PHI | **PHI** | 59.3% | 112.0–114.1 | 50.5% | 59.1% |
| 10:30 am | ORL @ TOR | **TOR** | 64.4% | 111.9–115.4 | 59.8% | 66.5% |
| 11:00 am | IND @ MIA | **MIA** | 78.0% | 113.0–120.3 | 61.7% | 73.5% |
| 11:00 am | HOU @ DAL | **HOU** | 73.4% | 117.5–111.6 | 34.8% | 24.9% |
| 11:00 am | LAC @ MIN | **MIN** | 71.5% | 111.0–116.3 | 63.5% | 75.1% |
| 1:00 pm | LAL @ GS | **LAL** | 61.1% | 117.3–114.7 | 43.5% | 50.1% |
| 1:00 pm | DEN @ PHX | **DEN** | 53.6% | 115.4–114.6 | 47.0% | 46.8% |

## V9 player projections (conditional on playing)

### CHA @ WSH

**CHA**

| Player | Min | PTS | REB | AST | 3PM | Official status |
|---|---:|---:|---:|---:|---:|---|
| Brandon Miller | 33.4 | 25.8 | 5.6 | 1.9 | 2.9 | Not listed |
| Dennis Schröder | 33.0 | 14.4 | 4.2 | 4.9 | 1.0 | Probable — Right foot inflammation / soreness |
| Moussa Diabaté | 29.0 | 8.3 | 9.3 | 2.4 | 0.0 | Not listed |
| Grayson Allen | 28.4 | 16.0 | 3.2 | 2.9 | 3.1 | Not listed |
| Naz Reid | 25.8 | 17.3 | 9.4 | 1.4 | 2.7 | Not listed |
| Sion James | 24.0 | 4.6 | 3.6 | 2.9 | 1.0 | Not listed |
| Royce O'Neale | 18.2 | 4.0 | 1.9 | 0.6 | 1.1 | Not listed |
| Ryan Kalkbrenner | 17.2 | 5.0 | 4.3 | 1.4 | 0.0 | Not listed |
| Tidjane Salaün | 13.3 | 4.5 | 3.1 | 0.1 | 0.8 | Not listed |
| Christian Anderson | 9.9 | 1.9 | 1.3 | 1.2 | 0.2 | Not listed |
| Kon Knueppel | 31.5 | 15.0 | 5.4 | 3.2 | 2.5 | Out — Left hamstring strain |
| LaMelo Ball | 31.1 | 25.5 | 5.1 | 7.7 | 5.0 | Not listed |

**WSH**

| Player | Min | PTS | REB | AST | 3PM | Official status |
|---|---:|---:|---:|---:|---:|---|
| Anthony Davis | 33.3 | 21.0 | 7.8 | 2.4 | 1.3 | Not listed |
| Trae Young | 31.4 | 19.3 | 3.6 | 8.7 | 2.1 | Not listed |
| Kyshawn George | 28.4 | 15.4 | 3.7 | 3.5 | 1.5 | Not listed |
| Bilal Coulibaly | 25.9 | 12.1 | 3.7 | 1.0 | 0.7 | Not listed |
| Alex Sarr | 24.1 | 10.3 | 4.9 | 2.6 | 0.8 | Not listed |
| Bub Carrington | 23.3 | 9.2 | 1.4 | 3.0 | 2.0 | Not listed |
| Khris Middleton | 19.6 | 6.4 | 2.4 | 1.3 | 0.7 | Not listed |
| Tre Johnson | 23.2 | 10.9 | 2.5 | 1.6 | 1.5 | Questionable — Right Achilles soreness / tightness |
| Justin Champagnie | 20.2 | 9.1 | 7.1 | 1.5 | 0.8 | Out — Right foot surgery |
| Deandre Ayton | 13.5 | 6.0 | 4.1 | 0.7 | 0.0 | Not listed |
| Will Riley | 18.6 | 8.8 | 2.6 | 2.0 | 0.7 | Not listed |

### CHI @ BOS

**CHI**

| Player | Min | PTS | REB | AST | 3PM | Official status |
|---|---:|---:|---:|---:|---:|---|
| Caleb Wilson | 35.0 | 19.8 | 6.7 | 2.4 | 1.6 | Not listed |
| Norman Powell | 30.3 | 21.5 | 2.6 | 1.8 | 3.2 | Not listed |
| Josh Giddey | 28.4 | 8.6 | 5.9 | 8.0 | 0.7 | Not listed |
| Matas Buzelis | 27.5 | 14.1 | 5.2 | 2.3 | 1.4 | Not listed |
| Leonard Miller | 23.9 | 11.9 | 5.5 | 1.1 | 1.2 | Not listed |
| Jalen Smith | 22.7 | 10.9 | 6.4 | 1.4 | 1.6 | Questionable — Left finger sprain |
| Tre Jones | 20.1 | 12.5 | 2.8 | 2.8 | 0.5 | Not listed |
| Isaac Okoro | 19.7 | 5.4 | 1.4 | 2.0 | 0.5 | Not listed |
| Buddy Hield | 12.8 | 4.5 | 2.0 | 1.4 | 0.8 | Not listed |
| Noa Essengue | 11.0 | 1.7 | 1.5 | 0.5 | 0.3 | Not listed |
| Zach Collins | 13.8 | 5.1 | 4.6 | 0.8 | 0.3 | Not listed |

**BOS**

| Player | Min | PTS | REB | AST | 3PM | Official status |
|---|---:|---:|---:|---:|---:|---|
| Jayson Tatum | 36.2 | 30.1 | 8.7 | 8.1 | 2.5 | Not listed |
| Paul George | 31.6 | 23.8 | 6.3 | 3.7 | 3.5 | Not listed |
| Derrick White | 30.0 | 12.7 | 4.5 | 5.8 | 2.2 | Not listed |
| Payton Pritchard | 27.6 | 17.0 | 2.4 | 5.0 | 3.1 | Not listed |
| Sam Hauser | 23.6 | 12.3 | 4.1 | 1.7 | 3.2 | Not listed |
| Neemias Queta | 21.3 | 10.7 | 6.7 | 2.1 | 0.3 | Not listed |
| Baylor Scheierman | 20.8 | 7.1 | 3.7 | 1.4 | 1.5 | Not listed |
| Mitchell Robinson | 20.7 | 6.5 | 5.4 | 0.7 | 0.0 | Not listed |
| Jordan Walsh | 20.3 | 7.2 | 4.4 | 1.1 | 1.1 | Not listed |
| Luka Garza | 14.6 | 7.1 | 4.1 | 0.9 | 0.4 | Not listed |
| Hugo González | 10.7 | 3.0 | 3.0 | 0.2 | 0.4 | Not listed |
| Ron Harper Jr. | 11.2 | 5.1 | 1.7 | 0.9 | 1.0 | Not listed |

### DET @ BKN

**DET**

| Player | Min | PTS | REB | AST | 3PM | Official status |
|---|---:|---:|---:|---:|---:|---|
| Cade Cunningham | 31.6 | 21.5 | 5.9 | 8.1 | 1.9 | Not listed |
| Duncan Robinson | 28.9 | 16.8 | 1.9 | 2.2 | 3.5 | Not listed |
| John Collins | 26.2 | 9.2 | 6.2 | 0.5 | 1.1 | Not listed |
| Ausar Thompson | 26.2 | 9.3 | 6.1 | 5.1 | 0.0 | Not listed |
| Daniss Jenkins | 24.7 | 11.6 | 3.7 | 4.5 | 1.3 | Not listed |
| Paul Reed | 24.0 | 15.7 | 8.0 | 1.9 | 0.6 | Not listed |
| Kevin Huerter | 20.7 | 7.4 | 2.9 | 2.3 | 1.3 | Not listed |
| Javonte Green | 17.4 | 7.3 | 2.8 | 0.5 | 1.4 | Not listed |
| Ronald Holland II | 16.4 | 5.0 | 3.7 | 1.8 | 0.6 | Not listed |
| Tolu Smith | 4.5 | 2.2 | 2.1 | 0.4 | 0.0 | Not listed |

**BKN**

| Player | Min | PTS | REB | AST | 3PM | Official status |
|---|---:|---:|---:|---:|---:|---|
| Julius Randle | 35.6 | 20.5 | 7.9 | 6.2 | 1.0 | Not listed |
| Michael Porter Jr. | 31.4 | 21.1 | 6.2 | 1.3 | 3.1 | Not listed |
| Keon Ellis | 25.6 | 5.7 | 2.1 | 3.0 | 1.0 | Not listed |
| Mikel Brown Jr. | 23.0 | 10.0 | 3.3 | 4.5 | 2.4 | Not listed |
| Egor Dëmin | 22.5 | 5.9 | 2.3 | 3.1 | 1.1 | Out — Right bone bruise |
| Chaney Johnson | 22.0 | 8.9 | 4.9 | 1.7 | 1.1 | Not listed |
| Noah Clowney | 20.7 | 6.8 | 4.1 | 0.8 | 0.9 | Questionable — Illness |
| Day'Ron Sharpe | 20.1 | 8.9 | 6.3 | 1.8 | 0.5 | Not listed |
| Nolan Traore | 19.4 | 10.9 | 2.8 | 2.3 | 1.1 | Not listed |
| Drake Powell | 25.0 | 5.9 | 2.3 | 1.9 | 0.6 | Available — G League - On Assignment |
| Moritz Wagner | 17.1 | 10.4 | 3.0 | 1.5 | 1.6 | Not listed |
| Ben Saraf | 24.3 | 10.4 | 3.2 | 3.5 | 0.5 | Out — G League - On Assignment |

### NY @ PHI

**NY**

| Player | Min | PTS | REB | AST | 3PM | Official status |
|---|---:|---:|---:|---:|---:|---|
| Jalen Brunson | 35.0 | 26.4 | 2.4 | 6.3 | 2.2 | Not listed |
| OG Anunoby | 32.4 | 17.4 | 6.6 | 2.5 | 2.2 | Not listed |
| Josh Hart | 32.0 | 8.5 | 6.9 | 3.5 | 1.6 | Not listed |
| Karl-Anthony Towns | 31.0 | 21.7 | 13.5 | 4.3 | 1.7 | Probable — Left wrist sprain |
| Landry Shamet | 25.4 | 8.7 | 1.7 | 2.1 | 2.3 | Not listed |
| Mikal Bridges | 24.7 | 6.5 | 1.8 | 1.9 | 1.1 | Not listed |
| Miles McBride | 17.6 | 6.0 | 2.3 | 1.1 | 1.6 | Not listed |
| Andre Drummond | 13.3 | 6.2 | 7.2 | 1.5 | 0.0 | Not listed |
| Tyler Kolek | 12.4 | 5.0 | 1.5 | 4.1 | 1.1 | Not listed |
| Jordan Clarkson | 10.8 | 5.3 | 1.9 | 0.9 | 0.2 | Not listed |
| Mohamed Diawara | 11.5 | 4.5 | 0.8 | 1.2 | 0.3 | Not listed |
| Pacôme Dadiet | 7.9 | 4.9 | 1.2 | 0.2 | 1.1 | Not listed |

**PHI**

| Player | Min | PTS | REB | AST | 3PM | Official status |
|---|---:|---:|---:|---:|---:|---|
| Jaylen Brown | 36.3 | 20.3 | 6.6 | 3.9 | 1.7 | Doubtful — Left patellar tendinopathy |
| Tyrese Maxey | 36.1 | 26.3 | 4.0 | 4.1 | 2.3 | Not listed |
| Joel Embiid | 35.5 | 24.3 | 9.7 | 4.4 | 1.3 | Not listed |
| VJ Edgecombe | 33.6 | 12.2 | 7.5 | 3.9 | 1.7 | Not listed |
| LeBron James | 33.2 | 15.1 | 6.0 | 6.8 | 0.8 | Not listed |
| Dean Wade | 26.6 | 3.5 | 2.3 | 0.8 | 0.8 | Not listed |
| Kentavious Caldwell-Pope | 26.0 | 6.7 | 2.6 | 1.5 | 1.3 | Not listed |
| Anfernee Simons | 23.7 | 8.7 | 2.5 | 1.3 | 2.2 | Not listed |
| Adem Bona | 13.6 | 2.1 | 3.2 | 0.6 | 0.0 | Not listed |
| Paul George | 29.9 | 18.0 | 5.3 | 2.9 | 2.6 | Not listed |
| Kelly Oubre Jr. | 27.5 | 12.1 | 5.8 | 1.0 | 1.1 | Not listed |

### ORL @ TOR

**ORL**

| Player | Min | PTS | REB | AST | 3PM | Official status |
|---|---:|---:|---:|---:|---:|---|
| Desmond Bane | 29.7 | 13.8 | 3.9 | 2.7 | 2.0 | Not listed |
| Franz Wagner | 29.2 | 19.1 | 5.1 | 4.1 | 1.0 | Not listed |
| Wendell Carter Jr. | 28.3 | 10.9 | 7.9 | 1.7 | 0.7 | Not listed |
| Tristan da Silva | 26.9 | 11.7 | 3.2 | 2.2 | 2.3 | Not listed |
| Jalen Suggs | 31.7 | 11.2 | 4.1 | 6.1 | 2.2 | Out — Right knee contusion / bone bruise |
| Anthony Black | 19.8 | 9.9 | 2.7 | 2.1 | 1.2 | Not listed |
| Jevon Carter | 18.1 | 4.4 | 1.3 | 1.8 | 1.1 | Not listed |
| Jamal Cain | 16.1 | 5.0 | 2.4 | 0.5 | 0.5 | Not listed |
| Goga Bitadze | 14.8 | 6.6 | 5.2 | 1.1 | 0.0 | Not listed |
| Paolo Banchero | 33.1 | 19.7 | 8.3 | 6.7 | 0.8 | Out — Right low-grade high ankle sprain |
| Jase Richardson | 11.7 | 5.9 | 1.2 | 1.1 | 0.7 | Not listed |
| Nikola Vučević | 11.0 | 2.4 | 2.4 | 1.8 | 0.2 | Not listed |

**TOR**

| Player | Min | PTS | REB | AST | 3PM | Official status |
|---|---:|---:|---:|---:|---:|---|
| RJ Barrett | 31.8 | 22.5 | 5.6 | 3.6 | 1.3 | Not listed |
| Scottie Barnes | 30.4 | 18.1 | 6.7 | 5.2 | 0.6 | Not listed |
| Ja'Kobe Walter | 27.0 | 12.6 | 3.7 | 2.1 | 2.8 | Not listed |
| Immanuel Quickley | 26.2 | 13.3 | 3.0 | 5.2 | 2.2 | Not listed |
| Jamal Shead | 22.2 | 6.5 | 1.8 | 4.6 | 0.5 | Not listed |
| Jakob Poeltl | 19.2 | 5.4 | 3.9 | 0.9 | 0.0 | Not listed |
| Collin Murray-Boyles | 18.4 | 8.8 | 4.7 | 1.6 | 0.5 | Not listed |
| Allen Graves | 16.2 | 5.3 | 3.6 | 0.9 | 0.2 | Not listed |
| Jamison Battle | 10.6 | 4.4 | 0.9 | 0.6 | 0.7 | Not listed |
| Trayce Jackson-Davis | 7.9 | 4.6 | 2.8 | 0.6 | 0.0 | Not listed |

### IND @ MIA

**IND**

| Player | Min | PTS | REB | AST | 3PM | Official status |
|---|---:|---:|---:|---:|---:|---|
| Andrew Nembhard | 33.0 | 16.3 | 2.4 | 9.4 | 1.7 | Probable — Neck stiffness / soreness |
| Pascal Siakam | 31.6 | 25.2 | 8.2 | 4.1 | 1.6 | Not listed |
| Aaron Nesmith | 25.7 | 15.2 | 2.3 | 1.2 | 2.6 | Probable — Left hamstring strain |
| Kelly Oubre Jr. | 24.4 | 10.2 | 2.5 | 1.8 | 0.9 | Not listed |
| Tyrese Haliburton | 33.1 | 22.6 | 4.7 | 9.5 | 2.7 | Out — Left hamstring strain |
| Jarace Walker | 22.6 | 7.8 | 6.1 | 2.1 | 1.1 | Not listed |
| Obi Toppin | 21.8 | 16.6 | 5.6 | 1.6 | 2.3 | Questionable — Low-back soreness |
| Quenton Jackson | 21.2 | 7.7 | 2.4 | 4.5 | 0.4 | Not listed |
| Jay Huff | 19.5 | 7.2 | 5.1 | 1.9 | 0.9 | Not listed |
| Jalen Slawson | 16.1 | 3.9 | 3.2 | 1.7 | 0.3 | Not listed |
| Larry Nance Jr. | 15.9 | 2.6 | 2.8 | 0.4 | 0.4 | Not listed |
| Kobe Brown | 19.1 | 7.7 | 4.0 | 2.1 | 1.1 | Not listed |

**MIA**

| Player | Min | PTS | REB | AST | 3PM | Official status |
|---|---:|---:|---:|---:|---:|---|
| Davion Mitchell | 32.9 | 15.7 | 1.4 | 6.8 | 1.7 | Not listed |
| Bam Adebayo | 32.1 | 16.3 | 8.5 | 4.1 | 0.9 | Not listed |
| Giannis Antetokounmpo | 31.8 | 27.3 | 11.8 | 4.5 | 0.5 | Not listed |
| Pelle Larsson | 30.5 | 13.2 | 3.5 | 4.3 | 1.1 | Not listed |
| Andrew Wiggins | 26.8 | 11.3 | 2.8 | 1.9 | 1.5 | Not listed |
| Bobby Portis Jr. | 23.9 | 10.9 | 8.6 | 2.1 | 2.0 | Not listed |
| Klay Thompson | 19.6 | 7.4 | 1.5 | 1.2 | 2.2 | Not listed |
| Tim Hardaway Jr. | 19.6 | 7.6 | 2.3 | 0.8 | 1.2 | Not listed |
| Nikola Jović | 10.8 | 3.9 | 2.6 | 0.7 | 0.5 | Not listed |
| Dru Smith | 10.5 | 4.0 | 1.0 | 1.8 | 0.5 | Not listed |
| Tyler Herro | 31.3 | 16.3 | 5.5 | 5.5 | 2.4 | Not listed |
| Jaime Jaquez Jr. | 28.1 | 20.3 | 4.0 | 4.4 | 1.8 | Not listed |

### HOU @ DAL

**HOU**

| Player | Min | PTS | REB | AST | 3PM | Official status |
|---|---:|---:|---:|---:|---:|---|
| Amen Thompson | 35.1 | 21.4 | 7.5 | 4.4 | 0.2 | Not listed |
| Kevin Durant | 34.4 | 24.8 | 6.4 | 4.2 | 2.1 | Not listed |
| Jabari Smith Jr. | 34.2 | 17.5 | 5.9 | 2.0 | 2.8 | Not listed |
| Fred VanVleet | 29.7 | 13.6 | 4.1 | 6.3 | 2.3 | Not listed |
| Tari Eason | 26.2 | 10.8 | 6.0 | 1.0 | 0.6 | Not listed |
| Reed Sheppard | 23.2 | 11.4 | 2.6 | 3.9 | 2.3 | Out — Low-back soreness |
| Alperen Sengun | 32.9 | 22.6 | 9.2 | 6.8 | 1.0 | Questionable — Low-back soreness |
| Bogdan Bogdanović | 14.4 | 8.7 | 1.6 | 1.7 | 2.1 | Not listed |
| Clint Capela | 12.4 | 4.3 | 4.1 | 0.8 | 0.1 | Not listed |
| Jae'Sean Tate | 6.4 | 2.2 | 2.2 | 1.0 | 0.1 | Not listed |
| Isaiah Crawford | 4.8 | 2.5 | 1.1 | 0.2 | 0.1 | Not listed |

**DAL**

| Player | Min | PTS | REB | AST | 3PM | Official status |
|---|---:|---:|---:|---:|---:|---|
| P.J. Washington | 32.8 | 15.2 | 7.7 | 0.9 | 1.9 | Not listed |
| Cooper Flagg | 29.9 | 25.1 | 6.5 | 5.8 | 1.7 | Not listed |
| Zaccharie Risacher | 29.8 | 9.1 | 6.0 | 1.3 | 1.1 | Not listed |
| Kyrie Irving | 27.4 | 17.7 | 3.1 | 3.7 | 2.8 | Not listed |
| Max Christie | 26.5 | 11.3 | 3.7 | 2.1 | 2.4 | Not listed |
| Daniel Gafford | 22.3 | 8.2 | 6.8 | 2.2 | 0.1 | Not listed |
| Marcus Sasser | 21.2 | 7.0 | 1.7 | 2.2 | 1.3 | Not listed |
| Morez Johnson Jr. | 15.3 | 7.2 | 3.4 | 1.5 | 0.0 | Not listed |
| Caleb Martin | 14.6 | 5.6 | 2.2 | 0.4 | 0.8 | Available — Right thumb splint |
| Walter Clayton Jr. | 12.7 | 4.3 | 2.1 | 3.8 | 0.7 | Not listed |
| Moussa Cissé | 12.5 | 4.7 | 5.8 | 0.1 | 0.0 | Not listed |
| Naji Marshall | 27.8 | 13.1 | 3.6 | 4.3 | 0.8 | Probable — Illness |

### LAC @ MIN

**LAC**

| Player | Min | PTS | REB | AST | 3PM | Official status |
|---|---:|---:|---:|---:|---:|---|
| Darius Garland | 31.6 | 19.0 | 2.0 | 6.2 | 2.1 | Not listed |
| Kris Dunn | 28.1 | 6.7 | 3.8 | 4.4 | 1.0 | Not listed |
| Derrick Jones Jr. | 27.5 | 10.0 | 5.2 | 1.3 | 1.8 | Not listed |
| Keaton Wagler | 26.5 | 15.2 | 4.3 | 3.4 | 2.3 | Not listed |
| Brook Lopez | 24.3 | 12.5 | 5.3 | 1.6 | 1.6 | Not listed |
| Rui Hachimura | 31.0 | 9.8 | 5.9 | 0.9 | 1.9 | Probable — Left quad soreness |
| Kobe Sanders | 21.0 | 8.9 | 2.4 | 2.1 | 1.2 | Not listed |
| Isaiah Jackson | 20.0 | 8.6 | 5.6 | 1.6 | 0.0 | Not listed |
| Gradey Dick | 17.1 | 7.0 | 4.3 | 0.0 | 1.0 | Not listed |
| Cam Christie | 6.2 | 1.4 | 0.7 | 0.2 | 0.0 | Not listed |
| James Harden | 34.4 | 23.0 | 5.2 | 9.0 | 2.7 | Not listed |

**MIN**

| Player | Min | PTS | REB | AST | 3PM | Official status |
|---|---:|---:|---:|---:|---:|---|
| Jaden McDaniels | 32.7 | 17.2 | 5.8 | 2.8 | 1.4 | Not listed |
| Jonathan Kuminga | 30.8 | 13.7 | 5.2 | 3.0 | 2.1 | Not listed |
| Rudy Gobert | 29.5 | 6.4 | 10.9 | 1.2 | 0.0 | Not listed |
| Ayo Dosunmu | 28.8 | 14.1 | 3.4 | 3.4 | 1.4 | Not listed |
| LaMelo Ball | 25.8 | 13.4 | 2.2 | 7.1 | 2.9 | Not listed |
| Terrence Shannon Jr | 23.6 | 15.8 | 3.3 | 2.5 | 2.2 | Not listed |
| Anthony Edwards | 32.4 | 27.8 | 3.8 | 3.7 | 3.3 | Out — Right knee arthroscopy |
| Joan Beringer | 17.2 | 8.2 | 7.5 | 0.7 | 0.0 | Not listed |
| Trey Lyles | 16.2 | 4.5 | 3.3 | 1.2 | 1.0 | Not listed |
| Bones Hyland | 14.4 | 7.6 | 1.9 | 1.9 | 1.7 | Not listed |
| Jaylen Clark | 10.9 | 3.9 | 1.2 | 1.1 | 0.9 | Not listed |
| Julius Randle | 32.6 | 20.7 | 5.3 | 4.4 | 1.5 | Not listed |

### LAL @ GS

**LAL**

| Player | Min | PTS | REB | AST | 3PM | Official status |
|---|---:|---:|---:|---:|---:|---|
| Austin Reaves | 34.4 | 23.3 | 4.0 | 4.9 | 2.3 | Not listed |
| Walker Kessler | 30.1 | 13.9 | 8.4 | 0.9 | 0.0 | Available — Left finger splint |
| Quentin Grimes | 27.5 | 9.6 | 3.7 | 2.4 | 0.5 | Not listed |
| Jake LaRavia | 25.1 | 5.3 | 4.8 | 1.5 | 0.8 | Not listed |
| Matisse Thybulle | 25.0 | 9.9 | 1.6 | 1.0 | 2.4 | Not listed |
| Sandro Mamukelashvili | 24.8 | 11.3 | 4.9 | 1.8 | 1.1 | Not listed |
| Luka Dončić | 35.3 | 36.0 | 6.3 | 8.1 | 4.6 | Not listed |
| Ziaire Williams | 28.7 | 11.7 | 2.9 | 2.4 | 1.8 | Out — Left foot / heel injury management |
| Collin Sexton | 18.1 | 12.8 | 2.0 | 2.6 | 1.5 | Not listed |
| Jarred Vanderbilt | 16.8 | 4.2 | 4.6 | 1.7 | 0.2 | Not listed |
| LeBron James | 29.8 | 22.7 | 6.8 | 9.1 | 1.1 | Not listed |

**GS**

| Player | Min | PTS | REB | AST | 3PM | Official status |
|---|---:|---:|---:|---:|---:|---|
| Yaxel Lendeborg | 33.7 | 24.3 | 9.4 | 3.9 | 2.2 | Not listed |
| Brandin Podziemski | 29.9 | 17.2 | 3.9 | 3.6 | 2.0 | Not listed |
| Draymond Green | 27.6 | 4.6 | 5.4 | 6.8 | 0.8 | Not listed |
| Stephen Curry | 27.5 | 26.6 | 3.7 | 3.4 | 3.7 | Not listed |
| De'Anthony Melton | 21.6 | 8.7 | 3.7 | 2.2 | 1.6 | Not listed |
| Georges Niang | 19.8 | 6.6 | 2.9 | 1.1 | 1.0 | Not listed |
| Al Horford | 19.4 | 6.0 | 4.0 | 1.6 | 1.2 | Not listed |
| Gui Santos | 25.4 | 10.8 | 4.7 | 2.3 | 1.1 | Questionable — Left knee tendinitis |
| Brandon Williams | 15.9 | 10.5 | 3.1 | 2.3 | 0.9 | Not listed |
| Will Richard | 15.6 | 3.0 | 1.6 | 0.8 | 0.3 | Not listed |
| Gary Payton II | 14.3 | 6.2 | 2.0 | 0.5 | 0.3 | Not listed |
| Charles Bassey | 12.0 | 7.4 | 4.5 | 0.6 | 0.0 | Not listed |

### DEN @ PHX

**DEN**

| Player | Min | PTS | REB | AST | 3PM | Official status |
|---|---:|---:|---:|---:|---:|---|
| Jamal Murray | 38.3 | 23.8 | 4.7 | 6.5 | 4.3 | Not listed |
| Nikola Jokić | 35.2 | 24.2 | 11.7 | 8.7 | 1.1 | Not listed |
| Christian Braun | 34.5 | 12.9 | 4.2 | 2.1 | 1.2 | Not listed |
| Aaron Gordon | 30.1 | 12.9 | 6.0 | 3.1 | 1.3 | Not listed |
| DeMar DeRozan | 26.4 | 12.8 | 2.7 | 2.8 | 0.5 | Not listed |
| Trevon Brazile | 24.3 | 9.5 | 7.1 | 0.0 | 1.2 | Not listed |
| Bryce Hopkins | 17.4 | 3.0 | 2.0 | 0.4 | 0.2 | Not listed |
| Marvin Bagley III | 13.0 | 6.1 | 3.6 | 0.7 | 0.0 | Not listed |
| Tyus Jones | 10.3 | 2.6 | 0.5 | 1.1 | 0.4 | Not listed |
| Zeke Nnaji | 9.9 | 1.8 | 2.0 | 0.8 | 0.2 | Not listed |
| Cameron Johnson | 27.7 | 13.4 | 3.8 | 2.7 | 2.3 | Questionable — Right ankle sprain |

**PHX**

| Player | Min | PTS | REB | AST | 3PM | Official status |
|---|---:|---:|---:|---:|---:|---|
| Devin Booker | 34.2 | 28.1 | 4.0 | 6.3 | 1.6 | Not listed |
| Miles Bridges | 31.4 | 14.5 | 6.6 | 2.5 | 1.4 | Not listed |
| Dillon Brooks | 29.1 | 15.5 | 3.9 | 2.4 | 1.7 | Not listed |
| Jalen Green | 25.6 | 16.3 | 3.0 | 2.6 | 1.5 | Not listed |
| Collin Gillespie | 24.1 | 7.1 | 3.1 | 3.5 | 1.6 | Not listed |
| Jordan Goodwin | 20.3 | 9.4 | 3.9 | 1.9 | 2.5 | Not listed |
| Khaman Maluach | 19.2 | 7.5 | 7.9 | 0.7 | 0.3 | Not listed |
| Ryan Dunn | 16.3 | 5.9 | 4.5 | 1.1 | 0.7 | Not listed |
| Rasheer Fleming | 15.2 | 4.9 | 2.0 | 0.4 | 0.8 | Not listed |
| Jamaree Bouyea | 11.6 | 6.5 | 1.8 | 1.8 | 0.2 | Not listed |
| Oso Ighodaro | 19.5 | 6.7 | 5.7 | 3.0 | 0.0 | Questionable — Right oblique strain |

## Tonight's review ledger

Forecast columns above are immutable. The review will copy this snapshot, add actual final scores and participating-player box scores, then calculate winner accuracy, mean Brier score, score MAE per team, and player MAE for PTS/REB/AST/3PM. DNPs are excluded from player MAE, matching V9's audited evaluation design.

Data cutoffs: schedule 2026-10-30T14:03:59+00:00; prior-season context 2026-10-30T14:05:33+00:00; V9/rotation snapshot 2026-10-30T16:15:22+00:00; official injury report 2026-10-30T21:15:00Z. Unknowns remain: confirmed starters and any status change after 5:15 p.m. ET. “Not listed” is not treated as proof of health.
