-- Interim: while the pictorial column backfills, match_artworks must keep
-- searching the full pictorial set — filtering on a half-filled column
-- would silently shrink the live wall. The regex predicate is fast enough
-- under the HNSW candidate window; only corpus_size's full-table count
-- timed out, and it now reads the column (grows as the backfill lands).
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
