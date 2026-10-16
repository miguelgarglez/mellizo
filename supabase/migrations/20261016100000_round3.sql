-- Round 3, stage A: build the new corpus in artworks_next, then swap.
-- The corpus grows from ~22k to ~200k works. Storage switches to halfvec
-- (pgvector 0.8): 512 dims at fp16 = 1KB/row, so ~200k rows fit the free
-- tier (~240MB) where vector(512) would not. No vector index: a seq scan
-- over 200k halfvec rows answers in tens of ms and has perfect recall.
-- pal/sal carry the explainer's evidence (dominant palette, saliency
-- centroid), measured at embed time.
create table if not exists mellizo.artworks_next (
  id text primary key,
  source text not null,
  title text not null,
  artist text not null default '',
  date text not null default '',
  medium text not null default '',
  department text not null default '',
  image_url text not null,
  thumb_url text not null default '',
  object_url text not null,
  img_w int, img_h int,
  pal jsonb, sal jsonb,
  embedding halfvec(512) not null
);

alter table mellizo.artworks_next enable row level security;
create policy "artworks are world-readable" on mellizo.artworks_next for select using (true);
grant usage on schema mellizo to anon, authenticated, service_role;
grant select on mellizo.artworks_next to anon, authenticated;
grant select, insert, update, delete on mellizo.artworks_next to service_role;
