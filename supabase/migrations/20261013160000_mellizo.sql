create extension if not exists vector;
create schema if not exists mellizo;

create table if not exists mellizo.artworks (
  id bigint primary key,
  title text not null,
  artist text not null default '',
  date text not null default '',
  medium text not null default '',
  department text not null default '',
  image_url text not null,
  object_url text not null,
  embedding vector(512) not null
);

alter table mellizo.artworks enable row level security;
create policy "artworks are world-readable" on mellizo.artworks for select using (true);

create index if not exists artworks_embedding_hnsw
  on mellizo.artworks using hnsw (embedding vector_cosine_ops);

create or replace function mellizo.match_artworks(
  query_embedding vector(512),
  match_count int default 8,
  dept text default null
)
returns setof mellizo.artworks
language sql stable
security definer
set search_path = mellizo, public
as $$
  select * from mellizo.artworks
  where (dept is null or department = dept)
  order by embedding <=> query_embedding
  limit least(match_count, 40);
$$;

grant usage on schema mellizo to anon, authenticated;
grant select on mellizo.artworks to anon, authenticated;
grant execute on function mellizo.match_artworks(vector(512), int, text) to anon, authenticated;
