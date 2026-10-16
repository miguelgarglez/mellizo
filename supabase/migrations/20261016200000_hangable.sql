-- Round 3, curation: the wall hangs pictures. Blind testing showed the
-- expanded corpus's top matches landing on objects — lace, bronze, glass,
-- armor — that are CLIP-close but are not things a gallery wall hangs in a
-- frame. match_artworks now searches only pictorial media (paintings,
-- prints, drawings, photographs, works on paper, scrolls, tapestries);
-- sculpture and decorative arts stay in the table but off the wall.
-- corpus_size reports the hangable count so the UI stays honest.

create or replace function mellizo.pictorial(med text)
returns boolean
language sql immutable
as $$
  select med is not null and med ~*
    'painting|\moil|watercolor|watercolour|gouache|tempera|pastel|ink|graphite|charcoal|chalk|crayon|\mpen|pencil|drawing|print|collotype|lithograph|engraving|etching|woodcut|woodblock|drypoint|mezzotint|aquatint|monotype|screenprint|serigraph|stencil|linocut|photograph|albumen|gelatin|photogravure|daguerreotype|cyanotype|calotype|ambrotype|salted paper|platinum|autochrome|collage|poster|scroll|album|miniature|illuminated|manuscript|fresco|tapestry|silk|acrylic|canvas|panel|paper|vellum|parchment';
$$;

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
grant execute on function mellizo.pictorial(text) to anon, authenticated;
