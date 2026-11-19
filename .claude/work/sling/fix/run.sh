#!/bin/bash
# 쓰는 법: fix/run.sh [단계들] — 빌드 → solve(reach) → 사람 손(빠르게)
cd "$(dirname "$0")"
python3 ../tools/build.py >/dev/null || exit 1
L=${1:-1,2,3,4,5,6,7,8,9,10}
/usr/bin/python3 v_solve.py $L --reach > solve.log 2>&1
grep -E '^\| [0-9]' out_reach/solve_table.md
/usr/bin/python3 v_human_sim.py $L --fast > human.log 2>&1
sort -n human.log | awk '{print $1, $3"/"$5}' | tr '\n' ' '; echo
if [ -n "$UPTEST" ]; then /usr/bin/python3 v_human_sim.py $L --fast --up > human_up.log 2>&1; echo UP; sort -n human_up.log | awk '{print $1, $3"/"$5}' | tr '\n' ' '; echo; fi
