-- Round 3, stage B: atomic swap. Run only after artworks_next is fully
-- loaded and spot-checked. The old table drops inside the same
-- transaction, so the RPC never sees an empty corpus.
begin;

drop function if exists mellizo.match_artworks(vector(512), integer);
drop table if exists mellizo.artworks;
alter table mellizo.artworks_next rename to artworks;

create function mellizo.match_artworks(
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
  order by embedding <=> query_embedding::halfvec
  limit least(match_count, 40);
$$;

create function mellizo.corpus_size()
returns int
language sql stable
security definer
set search_path = mellizo, public
as $$ select count(*)::int from mellizo.artworks $$;

grant execute on function mellizo.match_artworks(vector(512), int) to anon, authenticated;
grant execute on function mellizo.corpus_size() to anon, authenticated;

commit;
