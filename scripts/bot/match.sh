#!/bin/sh
# Runs a duel on 4 processes and sums up A's score: match.sh '<A>' '<B>' <pairs per process> [seed base]
A="$1"; B="$2"; N="$3"; BASE="${4:-1}"
dir=$(dirname "$0")
for k in 0 1 2 3; do
  npx tsx "$dir/duel.ts" "$A" "$B" $((BASE + k * 1000)) "$N" &
done | node -e '
let s=0,g=0;require("readline").createInterface({input:process.stdin}).on("line",l=>{const r=JSON.parse(l);s+=r.score;g+=r.games}).on("close",()=>{const p=s/g;const elo=p<=0?-999:p>=1?999:Math.round(-400*Math.log10(1/p-1));console.log(`A scored ${s}/${g} (${(p*100).toFixed(1)}%), about ${elo>0?"+":""}${elo} Elo`)})'
