-- corpus_size timed out on the live wall: counting hangable works meant
-- running the medium regex over every row, per request. Materialize the
-- predicate once as a column so reads are a plain boolean filter, and
-- point both functions at it. Backfill runs in batches (see
-- scripts/backfill-pictorial.mjs) to stay inside the statement timeout.

alter table mellizo.artworks
  add column if not exists pictorial boolean;

create index if not exists artworks_pictorial_idx
  on mellizo.artworks (pictorial) where pictorial;

-- any rows still unclassified are treated as not pictorial until the
-- backfill completes, so corpus_size never overstates the hangable wall
create or replace function mellizo.match_artworks(
  query_embedding vector(512),
  match_count int default 8
)
returns table (
  id text, source text, title text, artist text, date text, medium text,
  department text, image_url text, thumb_url text, object_url text,
  img_w int, img_h int, pal jsonb, sal jsonb, distance double precision
)
language sql stable
security definer
set search_path = mellizo, public
as $$
  select id, source, title, artist, date, medium, department,
         image_url, thumb_url, object_url, img_w, img_h, pal, sal,
         (embedding <=> query_embedding::halfvec) as distance
  from mellizo.artworks
  where pictorial
  order by embedding <=> query_embedding::halfvec
  limit least(match_count, 40);
$$;

create or replace function mellizo.corpus_size()
returns int
language sql stable
security definer
set search_path = mellizo, public
as $$ select count(*)::int from mellizo.artworks where pictorial $$;
