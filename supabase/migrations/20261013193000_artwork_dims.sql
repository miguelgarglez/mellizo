-- Degenerate artworks (aspect ratio beyond 4:1, or a side under 128px)
-- embed as smears that attract unrelated queries, and render as invisible
-- slivers in the result frame. Store display-image dims, return them to the
-- client for frame sizing, and keep degenerate rows out of match results.
-- Measured on the 22,784-row corpus: 570 rows fail the rule.
alter table mellizo.artworks add column if not exists img_w int;
alter table mellizo.artworks add column if not exists img_h int;

-- return type changes, so the function must be dropped and recreated
drop function if exists mellizo.match_artworks(vector(512), integer);
create function mellizo.match_artworks(
  query_embedding vector(512),
  match_count int default 8
)
returns table (
  id text, source text, title text, artist text, date text, medium text,
  department text, image_url text, thumb_url text, object_url text,
  img_w int, img_h int, distance double precision
)
language sql stable
security definer
set search_path = mellizo, public
as $$
  select id, source, title, artist, date, medium, department,
         image_url, thumb_url, object_url, img_w, img_h,
         (embedding <=> query_embedding) as distance
  from mellizo.artworks
  where img_w is null
     or (least(img_w, img_h) >= 128
         and img_w::float8 / img_h <= 4
         and img_h::float8 / img_w <= 4)
  order by embedding <=> query_embedding
  limit least(match_count, 40);
$$;

grant execute on function mellizo.match_artworks(vector(512), int) to anon, authenticated;
