# Read broken CSV files faster

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Menma1993/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Menma1993/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A fast drop-in for csv-reader 1.0.0: `solve.js` answers every case exactly as
the reference does (`{columns, rows, errors}`, including its broken-row policy),
but reads the text with `indexOf`/`slice` jumps instead of one character at a
time. Clean lines go through one native `split(',')` each; quoted fields jump
quote to quote; error objects are only built when an error actually happens.

- `solve.js` — the parser, dependency-free ES module, `run(input)`.
- `main.ts` — the driver: reads `/input/cases.json`, writes `/output/answers.json`.
