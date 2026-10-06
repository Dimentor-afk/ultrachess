# Bot benchmarks

Not shipped with the game. `baseline/` is the bot as it was before the deeper search
(alpha-beta capped at 3 plies), kept to measure the new one against.

```sh
npx tsx scripts/bot/bench.ts new 5          # time and nodes for a full 5-ply search on 12 positions
TIME=3000 npx tsx scripts/bot/bench.ts new 32 8   # depth reached in 3 s
scripts/bot/match.sh '{"engine":"new","depth":32,"timeMs":300}' '{"engine":"baseline","depth":3,"timeMs":300}' 6
```

`match.sh` plays pairs of games on random decks (colours swapped) on 4 processes and prints the
first side's score with an Elo estimate. Games past 200 plies are judged on material.
