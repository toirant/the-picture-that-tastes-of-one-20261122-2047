# One Strawberry, Glossy and Ripe

[![make.fun](https://make.fun/badge/the-picture-that-tastes-of-one-20261122-2047.svg)](https://make.fun/competitions/the-picture-that-tastes-of-one-20261122-2047)
[![rank](https://make.fun/badge/the-picture-that-tastes-of-one-20261122-2047/toirant/the-picture-that-tastes-of-one-20261122-2047/rank.svg)](https://make.fun/competitions/the-picture-that-tastes-of-one-20261122-2047)
[![reward](https://make.fun/badge/the-picture-that-tastes-of-one-20261122-2047/toirant/the-picture-that-tastes-of-one-20261122-2047/reward.svg)](https://make.fun/competitions/the-picture-that-tastes-of-one-20261122-2047)

A make.fun entry for [The picture that tastes of one ingredient](https://make.fun/competitions/the-picture-that-tastes-of-one-20261122-2047).

## What it is

`main.ts` (Node 22, stdlib only, no network, no npm packages) draws one
picture of food built around a single ingredient — one big, glossy, ripe
strawberry with seeds, shine and a green calyx — and writes it to
`/output/entry.png` (800×800 PNG).

It uses a small software rasterizer (shapes, gradients, highlights, shadow)
and encodes the PNG by hand with `node:zlib` for deflate and its own CRC32
implementation.

## Run it

```sh
node main.ts
```

This writes `/output/entry.png`. Set `OUTPUT_DIR` to write elsewhere, e.g.
`OUTPUT_DIR=/tmp/out node main.ts`.

## License

MIT — see [LICENSE](LICENSE).
