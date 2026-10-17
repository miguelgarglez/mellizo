# mellizo

![mellizo](docs/launch-poster.png)

**Drop any photo — meet its twin among open artworks.**

https://mellizo.vercel.app

## What it does

mellizo is a daylit gallery wall. You drop a photograph — a face, a dog, a plate of pasta, a sunset — and the wall rearranges itself into a diptych: your photograph beside the open-access artwork it most resembles, hung together under a flat red resemblance mark.

The search runs against a corpus of **~106,000** public-domain and open-access works from the Metropolitan Museum of Art, the National Gallery of Art, and the Cleveland Museum of Art — every one a picture, because the wall hangs pictures: paintings, drawings, prints, and photographs. Bronzes and porcelain stay in storage. Your photograph never leaves your device.

And because a bare number would be asking for faith, the match explains itself: a measured one-line reading of the resemblance, plus three lenses you can switch on — palette, composition, and figure.

## How it works

Your photo is embedded locally in the browser with CLIP (`Xenova/clip-vit-base-patch16` via Transformers.js / ONNX Runtime, lazy-loaded after first paint — the finer 16×16 patch grid is what makes a beach snapshot come back twinned with a Monet rather than a postcard). The 512-dimensional vector is sent — as numbers, not pixels — to a Postgres `pgvector` table on Supabase, which answers with the nearest artworks by cosine distance through an HNSW index over `halfvec(512)` storage and an RPC function. If the remote corpus is unreachable, a bundled mini-corpus of the 21 wall works takes over, so the wall always answers — and says so ("pocket corpus · twenty-one works answered").

### The resemblance reads

Every result carries a sentence and three lenses, all computed from measurements taken at ingest (palette, saliency) and in your browser (the same measurements on your photo, plus pose):

- **palette** — the five measured dominant colors of each side, with the hues they share ringed.
- **composition** — the saliency centroid and spread of each image, drawn where the eye actually lands.
- **figure** — MediaPipe pose skeletons on both sides, lazy-loaded only if you ask. When no figure is detected it says so: "no figure found on either side — the match lives elsewhere."

The sentence only claims what it measured. If palette distance, saliency overlap, pose similarity, and aspect ratio all come back weak, the fallback is honest: "the match reads its shapes and surfaces rather than any single trait."

Two corpus rules keep the match honest:

- **Degenerate images are excluded.** A work whose display image is a sliver — an aspect ratio beyond 4:1, or a side under 128px — embeds as a meaningless smear that attracts unrelated queries. They are filtered in `match_artworks`, skipped by the ingest pipeline, and guarded again client-side. When an unusually shaped work still wins, the frame shows a readable detail and says so, and a work whose image fails to load announces itself instead of hanging a blank mat.
- **The resemblance number is calibrated.** The displayed score maps 0.42 → 41 and 0.95 → 97, and the caption says what it is: "an automated estimate of visual closeness." In blind 20-photo comparisons judged by independent vision models (a different family than the CLIP that built both arms), a coarser patch32 embedding space split verdicts with the old corpus — but in patch16 space the judge-preferred twin outranked the patch32 pick in all 20 cases. The fine grid, not just corpus size, is what carries resemblance. And the corpus is curated: in a pictorial-only corpus a lace cap or a bronze sconce can be CLIP-close yet unhangable, so only pictures compete for the wall.

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

Without them the app works against the bundled mini-corpus. `VITE_MATCH_RPC` overrides the RPC name (used to drive the app against a staging table during corpus swaps).

### Rebuilding the corpus

Prerequisites: a Supabase project with the migrations in `supabase/migrations/` applied (the `mellizo` schema must be exposed in the project's API settings; RPC calls send `Content-Profile`/`Accept-Profile` headers), and `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in the environment (the loader also falls back to `~/.config/lab/secrets.env`).

```bash
node scripts/fetch-met.mjs        # Met API catalog (gentle, resumable)
node scripts/fetch-met-wd.mjs     # Met works via Wikidata Commons links
node scripts/fetch-nga.mjs        # National Gallery of Art open-access CSV
node scripts/fetch-cle.mjs        # Cleveland open-access CSV
node scripts/fetch-aic.mjs        # Art Institute of Chicago (WAF-permitting)
node scripts/embed-v2.mjs         # embeddings + palette/saliency, resumable
node scripts/load-v2.mjs          # batch-upsert into mellizo.artworks_next
```

`EMBED_MODEL` selects the CLIP checkpoint (the live corpus is patch16; the client and corpus must always share a model — embeddings from different patch grids are not comparable). The pictorial corpus is dumped from the live table with `scripts/_dump-corpus.mjs` (`data/catalog-corpus.jsonl`), then re-embedded and staged just like a fresh corpus.

Embedding is resumable and parallelizable: workers scan every `data/embeddings-*.jsonl` for completed IDs and take disjoint source lists (`EMBED_SOURCES`, `EMBED_OUT`, `EMBED_SHARD`, `EMBED_DONE_PREFIX`). The loader stages into `artworks_next`; the swap migration renames it into place atomically, so the live corpus never degrades mid-load. At 150k+ rows an HNSW index (`halfvec_cosine_ops`) is required — a sequential scan exceeds PostgREST's statement timeout.

## Stack

React 19 · TypeScript · Vite · Transformers.js (CLIP, on-device) · Supabase pgvector (`halfvec` + HNSW, cosine) · MediaPipe pose (lazy-loaded from CDN) · Vercel edge image proxy (`api/img.ts`, museum-host allowlist, not an open proxy)

All artwork images are public domain / CC0 or the museums' open-access equivalents, loaded hot from the museums' own CDNs (AIC and Cleveland reads route through the image proxy where hotlinking or CORS requires it). Catalogue records come from the Met's Open Access CSV and API, Wikidata Commons links, the National Gallery's open-access release, and Cleveland's public API.

## License

MIT for the code. The artworks belong to their museums and the public domain.
