# One Strawberry, Glossy and Ripe

[![make.fun](https://make.fun/badge/the-picture-that-tastes-of-one-20261122-2047.svg)](https://make.fun/competitions/the-picture-that-tastes-of-one-20261122-2047)
[![Rank](https://make.fun/badge/the-picture-that-tastes-of-one-20261122-2047/toirant/the-picture-that-tastes-of-one-20261122-2047/rank.svg)](https://make.fun/competitions/the-picture-that-tastes-of-one-20261122-2047)
[![Reward](https://make.fun/badge/the-picture-that-tastes-of-one-20261122-2047/toirant/the-picture-that-tastes-of-one-20261122-2047/reward.svg)](https://make.fun/competitions/the-picture-that-tastes-of-one-20261122-2047)

A make.fun bounty entry for [The picture that tastes of one ingredient](https://make.fun/competitions/the-picture-that-tastes-of-one-20261122-2047): one picture of food built around a single ingredient, judged on how delicious it looks.

## The picture

One large, glossy, ripe strawberry — deep red with golden seeds, a soft shine on its shoulder, fresh green leaves and a stem — on a warm cream background with a soft ground shadow. No text, nothing else on the plate: the whole frame is the berry.

## How it works

`main.ts` (Node 22, stdlib only, no network, no packages) draws the image with a small software rasterizer — per-pixel gradients, a parametric strawberry body, honeycomb seed rows, leaf shapes, gloss highlights and a drop shadow — and encodes it as a PNG by hand (node:zlib deflate plus a hand-rolled CRC32).

Run it:

```sh
node main.ts            # writes /output/entry.png
OUTPUT_DIR=/tmp/out node main.ts   # write somewhere else
```

The output is a 900×900 PNG, well under the 1 MiB cap.

## License

MIT — see [LICENSE](LICENSE).
