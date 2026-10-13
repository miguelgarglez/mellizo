# mellizo

![mellizo](docs/launch-poster.png)

**Drop any photo — meet its twin among open artworks.**

https://mellizo.vercel.app

## What it does

mellizo is a daylit gallery wall. You drop a photograph — a face, a dog, a plate of pasta, a sunset — and the wall rearranges itself into a diptych: your photograph beside the open-access artwork it most resembles, hung together under a flat red resemblance mark.

The search runs against a corpus of ~22,100 public-domain works from the Metropolitan Museum of Art and the Cleveland Museum of Art. Your photograph never leaves your device.

## How it works

Your photo is embedded locally in the browser with CLIP (`Xenova/clip-vit-base-patch16` via Transformers.js / ONNX Runtime, lazy-loaded after first paint). The 512-dimensional vector is sent — as numbers, not pixels — to a Postgres `pgvector` table on Supabase (22,099 answerable works), which answers with the nearest artworks by cosine distance through an HNSW index and an RPC function. If the remote corpus is unreachable, a bundled mini-corpus of the 21 wall works takes over, so the wall always answers — and says so.

Two corpus rules keep the match honest:

- **Degenerate images are excluded.** A work whose display image is a sliver — an aspect ratio beyond 4:1, or a side under 128px — embeds as a meaningless smear that attracts unrelated queries (570 of 22,784 measured works, mostly handscrolls). They are filtered in `match_artworks`, skipped by the ingest pipeline, and guarded again client-side. When an unusually shaped work still wins, the frame shows a readable detail and says so, and a work whose image fails to load announces itself instead of hanging a blank mat.
- **The resemblance number is calibrated.** Raw CLIP cosine between a photo and its nearest artwork lands around 0.55–0.76 on this corpus, measured over a panel of test photos through the same quantized model the browser runs. The displayed score maps 0.42 → 41 and 0.95 → 97, so a true near-duplicate still reads like one and a decent match lands in the 60s–70s instead of every answer claiming 97.

The interesting part is the privacy boundary: the embedding model runs entirely on-device, so the only thing that crosses the wire is the vector — a point in CLIP space, not the photograph. The match quality is also a quiet experiment in what CLIP "sees": it keys on composition, palette, and texture rather than subject, which is why a beach snapshot can come back twinned with a Monet and not a postcard.

The wall itself is a real system too: entry and result are two separate hangs of the same frames, animated between placements, so the gallery visibly rearranges around your photograph instead of swapping in a result card.

## Run locally

```bash
npm install
npm run dev
```

For the full corpus, point `.env.local` at the Supabase project:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Without them the app works against the bundled mini-corpus.

### Rebuilding the corpus

Prerequisites: a Supabase project with the migrations in `supabase/migrations/` applied (the `mellizo` schema must be exposed in the project's API settings), `data/MetObjects.csv` from the Met's Open Access release, and `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in the environment (the loader also falls back to `~/.config/lab/secrets.env`).

```bash
node scripts/fetch-met.mjs        # Met highlights (gentle, resumable)
node scripts/fetch-cleveland.mjs  # Cleveland bulk catalog
node scripts/embed.mjs            # CLIP embeddings, resumable JSONL
node scripts/load.mjs             # batch-load into Supabase
```

## Stack

React 19 · TypeScript · Vite · Transformers.js (CLIP, on-device) · Supabase pgvector (HNSW, cosine) · web-haptics

All artwork images are public domain / CC0, loaded hot from the museums' own CDNs. Catalogue records come from the Met's Open Access CSV and Cleveland's public API.

## License

MIT for the code. The artworks belong to their museums and the public domain.
