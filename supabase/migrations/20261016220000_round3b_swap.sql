-- Round 3B swap: the staged table holds patch16 embeddings of the
-- pictorial corpus only (the wall hangs pictures; objects stay out).
-- Run only after artworks_next is fully loaded. Before this runs, the
-- live table's HNSW index is dropped to fit both tables in the free
-- tier — the client's pocket-corpus fallback covers the gap, and a
-- fresh index is built on the new table right after the swap.

drop table if exists mellizo.artworks;
alter table mellizo.artworks_next rename to artworks;

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
  where mellizo.pictorial(medium)
  order by embedding <=> query_embedding::halfvec
  limit least(match_count, 40);
$$;

create or replace function mellizo.corpus_size()
returns int
language sql stable
security definer
set search_path = mellizo, public
as $$ select count(*)::int from mellizo.artworks where mellizo.pictorial(medium) $$;

grant execute on function mellizo.match_artworks(vector(512), int) to anon, authenticated;
grant execute on function mellizo.corpus_size() to anon, authenticated;
