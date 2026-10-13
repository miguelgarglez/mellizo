-- Mixed-source corpus: Met + Cleveland ids collide as bigints, so the
-- primary key becomes a namespaced text id ("met-435809", "cle-94979").
drop function if exists mellizo.match_artworks(vector, integer, text);
drop table if exists mellizo.artworks;

create table mellizo.artworks (
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
  embedding vector(512) not null
);

alter table mellizo.artworks enable row level security;
create policy "artworks are world-readable" on mellizo.artworks for select using (true);

create or replace function mellizo.match_artworks(
  query_embedding vector(512),
  match_count int default 8
)
returns table (
  id text, source text, title text, artist text, date text, medium text,
  department text, image_url text, thumb_url text, object_url text,
  distance double precision
)
language sql stable
security definer
set search_path = mellizo, public
as $$
  select id, source, title, artist, date, medium, department,
         image_url, thumb_url, object_url,
         (embedding <=> query_embedding) as distance
  from mellizo.artworks
  order by embedding <=> query_embedding
  limit least(match_count, 40);
$$;

grant usage on schema mellizo to anon, authenticated;
grant select on mellizo.artworks to anon, authenticated;
grant execute on function mellizo.match_artworks(vector(512), int) to anon, authenticated;
