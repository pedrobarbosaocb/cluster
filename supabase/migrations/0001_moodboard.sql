-- Moodboard da FlatHead — backend no Supabase (issue #21).
--
-- Modelo de segurança: o front usa só a chave pública (anon). As tabelas ficam
-- no schema privado "mb" (fora da API REST) com RLS ligado e sem políticas;
-- tudo passa por funções RPC em "public" (security definer) que conferem PIN e
-- chave de dono, como o servidor Node faz. Erros voltam como {"error": "..."}
-- em vez de exceção, para que as tentativas erradas de PIN não sejam desfeitas
-- pelo rollback e o limite de tentativas funcione.
--
-- Rode inteiro no SQL Editor do projeto (é idempotente).

create extension if not exists pgcrypto with schema extensions;

create schema if not exists mb;

create table if not exists mb.boards (
  id text primary key,
  name text not null,
  created_at bigint not null,
  owner_hash text not null,
  pin_hash text
);

create table if not exists mb.images (
  id text primary key,
  board_id text not null references mb.boards (id) on delete cascade,
  path text not null,
  thumb_path text not null,
  width int not null,
  height int not null,
  palette jsonb not null,
  created_at bigint not null
);
create index if not exists images_board on mb.images (board_id);

create table if not exists mb.votes (
  board_id text not null references mb.boards (id) on delete cascade,
  image_id text not null references mb.images (id) on delete cascade,
  voter_id text not null,
  value int not null,
  at bigint not null,
  primary key (image_id, voter_id)
);
create index if not exists votes_board on mb.votes (board_id);

create table if not exists mb.layouts (
  board_id text primary key references mb.boards (id) on delete cascade,
  layout jsonb not null
);

-- autorização temporária para subir os arquivos de uma imagem no Storage
create table if not exists mb.upload_tickets (
  image_id text primary key,
  board_id text not null references mb.boards (id) on delete cascade,
  expires_at timestamptz not null
);

-- arquivos cuja imagem o dono apagou: só esses podem ser removidos do Storage
create table if not exists mb.deleted_files (
  name text primary key,
  at timestamptz not null default now()
);

create table if not exists mb.fails (
  key text primary key,
  n int not null,
  until timestamptz not null
);

-- configuração opcional, ex.: insert into mb.config values ('admin_token', '<16+ caracteres>');
create table if not exists mb.config (
  key text primary key,
  value text not null
);

alter table mb.boards enable row level security;
alter table mb.images enable row level security;
alter table mb.votes enable row level security;
alter table mb.layouts enable row level security;
alter table mb.upload_tickets enable row level security;
alter table mb.deleted_files enable row level security;
alter table mb.fails enable row level security;
alter table mb.config enable row level security;

revoke all on all tables in schema mb from public, anon, authenticated;
grant usage on schema mb to anon, authenticated; -- só para as funções das políticas do Storage

-- ---------------------------------------------------------------- utilitários

create or replace function mb.now_ms() returns bigint
language sql volatile set search_path = '' as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint
$$;

create or replace function mb.new_id(len int default 10) returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := '0123456789abcdefghijkmnopqrstuvwxyz';
  b bytea := extensions.gen_random_bytes(len);
  out text := '';
begin
  for i in 0 .. len - 1 loop
    out := out || substr(alphabet, get_byte(b, i) % 35 + 1, 1);
  end loop;
  return out;
end $$;

create or replace function mb.is_id(v text) returns boolean
language sql immutable set search_path = '' as $$
  select v is not null and v ~ '^[0-9a-z]{4,32}$'
$$;

create or replace function mb.sha256(v text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(v, 'sha256'), 'hex')
$$;

create or replace function mb.client_key(board text) returns text
language sql stable set search_path = '' as $$
  select coalesce(
    nullif(trim(split_part(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1)), ''),
    '?'
  ) || '|' || board
$$;

create or replace function mb.blocked(k text) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from mb.fails where key = k and until > now() and n >= 8)
$$;

create or replace function mb.fail(k text) returns void
language sql volatile set search_path = '' as $$
  insert into mb.fails (key, n, until) values (k, 1, now() + interval '10 minutes')
  on conflict (key) do update set
    n = case when mb.fails.until > now() then mb.fails.n + 1 else 1 end,
    until = case when mb.fails.until > now() then mb.fails.until else excluded.until end
$$;

create or replace function mb.is_owner(b mb.boards, key text) returns boolean
language plpgsql stable set search_path = '' as $$
declare
  admin text;
begin
  if key is null or length(key) < 16 or length(key) > 128 then return false; end if;
  select value into admin from mb.config where config.key = 'admin_token';
  if admin is not null and length(admin) >= 16 and admin = key then return true; end if;
  return b.owner_hash = mb.sha256(key);
end $$;

create or replace function mb.pin_ok(b mb.boards, pin text) returns boolean
language sql stable set search_path = '' as $$
  select b.pin_hash is null or coalesce(
    pin ~ '^\d{4,8}$' and extensions.crypt(pin, b.pin_hash) = b.pin_hash, false)
$$;

create or replace function mb.pub(b mb.boards) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', b.id, 'name', b.name, 'createdAt', b.created_at, 'locked', b.pin_hash is not null)
$$;

create or replace function mb.err(code text) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('error', code)
$$;

-- avisa quem está no board (Realtime Broadcast, canal público "board:<id>")
create or replace function mb.notify(board text, kind text) returns void
language plpgsql volatile set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('kind', kind), 'change', 'board:' || board, false);
exception when others then
  null; -- tempo real é bônus: nunca derruba a operação
end $$;

/**
 * Carrega o board e confere o acesso. Devolve null em "board" quando não pode:
 * motivo em "error" (not_found | throttled | locked). Dono passa sem PIN.
 */
create or replace function mb.access(board_id text, pin text, owner_key text, out b mb.boards, out owner boolean, out error text)
language plpgsql volatile set search_path = '' as $$
declare
  k text;
begin
  owner := false;
  if not mb.is_id(board_id) then error := 'not_found'; return; end if;
  select * into b from mb.boards where id = board_id;
  if b.id is null then error := 'not_found'; return; end if;
  k := mb.client_key(board_id);
  if mb.blocked(k) then b := null; error := 'throttled'; return; end if;
  owner := coalesce(mb.is_owner(b, owner_key), false);
  if not owner and not mb.pin_ok(b, pin) then
    if pin is not null and pin <> '' then perform mb.fail(k); end if;
    b := null;
    error := 'locked';
  end if;
end $$;

create or replace function mb.state(board text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'board', (select mb.pub(b) from mb.boards b where b.id = board),
    'images', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'boardId', i.board_id, 'url', i.path, 'thumbUrl', i.thumb_path,
        'width', i.width, 'height', i.height, 'palette', i.palette, 'createdAt', i.created_at
      ) order by i.created_at)
      from mb.images i where i.board_id = board), '[]'::jsonb),
    'votes', coalesce((
      select jsonb_agg(jsonb_build_object('imageId', v.image_id, 'voterId', v.voter_id, 'value', v.value, 'at', v.at))
      from mb.votes v where v.board_id = board), '[]'::jsonb),
    'layout', (select l.layout from mb.layouts l where l.board_id = board)
  )
$$;

create or replace function mb.valid_palette(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  s jsonb;
begin
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 8 then return false; end if;
  for s in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(s) <> 'object'
      or jsonb_typeof(s -> 'hex') <> 'string' or (s ->> 'hex') !~* '^#[0-9a-f]{6}$'
      or jsonb_typeof(s -> 'lab') <> 'array' or jsonb_array_length(s -> 'lab') <> 3
      or exists (select 1 from jsonb_array_elements(s -> 'lab') x where jsonb_typeof(x) <> 'number')
      or jsonb_typeof(s -> 'weight') <> 'number'
      or (s ->> 'weight')::numeric < 0 or (s ->> 'weight')::numeric > 1 then
      return false;
    end if;
  end loop;
  return true;
end $$;

create or replace function mb.clean_layout(v jsonb, board text) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  g jsonb;
  ids text[] := '{}';
  img_id text;
begin
  if jsonb_typeof(v) <> 'object' or jsonb_typeof(v -> 'groups') <> 'array' then return null; end if;
  if jsonb_array_length(v -> 'groups') = 0 or jsonb_array_length(v -> 'groups') > 200 then return null; end if;
  for g in select * from jsonb_array_elements(v -> 'groups') loop
    if jsonb_typeof(g) <> 'array' or jsonb_array_length(g) = 0 then return null; end if;
    if exists (select 1 from jsonb_array_elements(g) x where jsonb_typeof(x) <> 'string') then return null; end if;
    for img_id in select * from jsonb_array_elements_text(g) loop
      if img_id = any (ids) or not exists (select 1 from mb.images i where i.id = img_id and i.board_id = board) then
        return null;
      end if;
      ids := ids || img_id;
    end loop;
  end loop;
  return jsonb_build_object('groups', v -> 'groups');
end $$;

-- ------------------------------------------------- políticas do Storage (anon)

create or replace function mb.upload_allowed(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from regexp_match(name, '^([0-9a-z]{4,32})/([0-9a-z]{4,32})(_t)?\.(jpg|png|webp)$') m
    join mb.upload_tickets t on t.board_id = m[1] and t.image_id = m[2]
    where t.expires_at > now()
  )
$$;

create or replace function mb.deletable(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from mb.deleted_files d where d.name = deletable.name)
$$;

-- ----------------------------------------------------------------- RPC pública

create or replace function public.mb_list_boards() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(mb.pub(b) order by b.created_at desc), '[]'::jsonb) from mb.boards b
$$;

create or replace function public.mb_create_board(p_name text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  clean text := left(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 60);
  key text := rtrim(translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'), '=');
  b mb.boards;
begin
  if clean = '' then return mb.err('invalid'); end if;
  insert into mb.boards (id, name, created_at, owner_hash)
  values (mb.new_id(), clean, mb.now_ms(), mb.sha256(key))
  returning * into b;
  -- a chave do dono só é revelada aqui, uma vez
  return mb.pub(b) || jsonb_build_object('ownerKey', key);
end $$;

create or replace function public.mb_get_board(p_board text, p_pin text default null, p_owner text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  a record;
begin
  a := mb.access(p_board, p_pin, p_owner);
  if a.error is not null then return mb.err(a.error); end if;
  return mb.state(p_board);
end $$;

create or replace function public.mb_claim_owner(p_board text, p_key text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  b mb.boards;
  k text := mb.client_key(p_board);
begin
  if not mb.is_id(p_board) then return mb.err('not_found'); end if;
  select * into b from mb.boards where id = p_board;
  if b.id is null then return mb.err('not_found'); end if;
  if mb.blocked(k) then return mb.err('throttled'); end if;
  if coalesce(mb.is_owner(b, p_key), false) then
    delete from mb.fails where key = k;
    return jsonb_build_object('ok', true);
  end if;
  perform mb.fail(k);
  return mb.err('forbidden');
end $$;

/** Passo 1 do upload: confere o acesso e libera, por 15 min, os arquivos <board>/<id>[_t].<ext>. */
create or replace function public.mb_begin_upload(p_board text, p_pin text default null, p_owner text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  a record;
  new_img text := mb.new_id();
begin
  a := mb.access(p_board, p_pin, p_owner);
  if a.error is not null then return mb.err(a.error); end if;
  delete from mb.upload_tickets where expires_at < now();
  insert into mb.upload_tickets (image_id, board_id, expires_at) values (new_img, p_board, now() + interval '15 minutes');
  return jsonb_build_object('imageId', new_img);
end $$;

/** Passo 2: com os dois arquivos já no Storage, registra a imagem. */
create or replace function public.mb_add_image(
  p_board text, p_pin text, p_owner text, p_image text,
  p_path text, p_thumb_path text, p_width int, p_height int, p_palette jsonb
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  a record;
  rec mb.images;
  pat text := '^' || p_board || '/' || p_image || '%s\.(jpg|png|webp)$';
begin
  a := mb.access(p_board, p_pin, p_owner);
  if a.error is not null then return mb.err(a.error); end if;
  if not exists (select 1 from mb.upload_tickets t where t.image_id = p_image and t.board_id = p_board) then
    return mb.err('invalid');
  end if;
  if p_path !~ format(pat, '') or p_thumb_path !~ format(pat, '_t')
    or coalesce(p_width, 0) <= 0 or coalesce(p_height, 0) <= 0
    or not mb.valid_palette(p_palette) then
    return mb.err('invalid');
  end if;
  if (select count(*) from storage.objects o where o.bucket_id = 'moodboard' and o.name in (p_path, p_thumb_path)) <> 2 then
    return mb.err('invalid');
  end if;
  delete from mb.upload_tickets where image_id = p_image;
  insert into mb.images (id, board_id, path, thumb_path, width, height, palette, created_at)
  values (p_image, p_board, p_path, p_thumb_path, p_width, p_height, p_palette, mb.now_ms())
  returning * into rec;
  perform mb.notify(p_board, 'image');
  return jsonb_build_object(
    'id', rec.id, 'boardId', rec.board_id, 'url', rec.path, 'thumbUrl', rec.thumb_path,
    'width', rec.width, 'height', rec.height, 'palette', rec.palette, 'createdAt', rec.created_at
  );
end $$;

create or replace function public.mb_vote(
  p_board text, p_pin text, p_owner text, p_image text, p_voter text, p_value int
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  a record;
  now_ms bigint := mb.now_ms();
begin
  a := mb.access(p_board, p_pin, p_owner);
  if a.error is not null then return mb.err(a.error); end if;
  if not mb.is_id(p_image) or not mb.is_id(p_voter) or p_value is null or p_value not in (1, 2, 3, 5, 8) then
    return mb.err('invalid');
  end if;
  if not exists (select 1 from mb.images where id = p_image and board_id = p_board) then
    return mb.err('not_found');
  end if;
  insert into mb.votes (board_id, image_id, voter_id, value, at)
  values (p_board, p_image, p_voter, p_value, now_ms)
  on conflict (image_id, voter_id) do update set value = excluded.value, at = excluded.at;
  perform mb.notify(p_board, 'vote');
  return jsonb_build_object('imageId', p_image, 'voterId', p_voter, 'value', p_value, 'at', now_ms);
end $$;

create or replace function public.mb_delete_image(p_board text, p_owner text, p_image text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  a record;
  rec mb.images;
  lay jsonb;
  groups jsonb;
begin
  a := mb.access(p_board, null, p_owner);
  if a.error is not null then return mb.err(a.error); end if;
  if not a.owner then return mb.err('forbidden'); end if;
  delete from mb.images where id = p_image and board_id = p_board returning * into rec;
  if rec.id is null then return mb.err('not_found'); end if;
  select layout into lay from mb.layouts where board_id = p_board;
  if lay is not null then
    select coalesce(jsonb_agg(ng), '[]'::jsonb) into groups
    from (
      select (select jsonb_agg(x) from jsonb_array_elements(g) x where x #>> '{}' <> p_image) ng
      from jsonb_array_elements(lay -> 'groups') with ordinality as t(g, ord)
      order by ord
    ) s where ng is not null;
    if jsonb_array_length(groups) = 0 then delete from mb.layouts where board_id = p_board;
    else update mb.layouts set layout = jsonb_build_object('groups', groups) where board_id = p_board;
    end if;
  end if;
  insert into mb.deleted_files (name) values (rec.path), (rec.thumb_path) on conflict do nothing;
  perform mb.notify(p_board, 'delete');
  return jsonb_build_object('ok', true, 'files', jsonb_build_array(rec.path, rec.thumb_path));
end $$;

create or replace function public.mb_set_pin(p_board text, p_owner text, p_pin text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  a record;
  b mb.boards;
begin
  a := mb.access(p_board, null, p_owner);
  if a.error is not null then return mb.err(a.error); end if;
  if not a.owner then return mb.err('forbidden'); end if;
  if p_pin is not null and p_pin !~ '^\d{4,8}$' then return mb.err('invalid'); end if;
  update mb.boards
  set pin_hash = case when p_pin is null then null else extensions.crypt(p_pin, extensions.gen_salt('bf', 8)) end
  where id = p_board
  returning * into b;
  perform mb.notify(p_board, 'pin');
  return mb.pub(b);
end $$;

create or replace function public.mb_set_layout(p_board text, p_owner text, p_layout jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  a record;
  clean jsonb;
begin
  a := mb.access(p_board, null, p_owner);
  if a.error is not null then return mb.err(a.error); end if;
  if not a.owner then return mb.err('forbidden'); end if;
  if p_layout is null or p_layout = 'null'::jsonb then
    delete from mb.layouts where board_id = p_board;
  else
    clean := mb.clean_layout(p_layout, p_board);
    if clean is null then return mb.err('invalid'); end if;
    insert into mb.layouts (board_id, layout) values (p_board, clean)
    on conflict (board_id) do update set layout = excluded.layout;
  end if;
  perform mb.notify(p_board, 'layout');
  return jsonb_build_object('layout', clean);
end $$;

-- só as RPCs e as funções das políticas ficam acessíveis à chave pública
revoke all on all functions in schema mb from public, anon, authenticated;
grant execute on function mb.upload_allowed(text), mb.deletable(text) to anon, authenticated;

revoke all on function
  public.mb_list_boards(), public.mb_create_board(text), public.mb_get_board(text, text, text),
  public.mb_claim_owner(text, text), public.mb_begin_upload(text, text, text),
  public.mb_add_image(text, text, text, text, text, text, int, int, jsonb),
  public.mb_vote(text, text, text, text, text, int), public.mb_delete_image(text, text, text),
  public.mb_set_pin(text, text, text), public.mb_set_layout(text, text, jsonb)
from public;
grant execute on function
  public.mb_list_boards(), public.mb_create_board(text), public.mb_get_board(text, text, text),
  public.mb_claim_owner(text, text), public.mb_begin_upload(text, text, text),
  public.mb_add_image(text, text, text, text, text, text, int, int, jsonb),
  public.mb_vote(text, text, text, text, text, int), public.mb_delete_image(text, text, text),
  public.mb_set_pin(text, text, text), public.mb_set_layout(text, text, jsonb)
to anon, authenticated;

-- ---------------------------------------------------------------------- Storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moodboard', 'moodboard', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "moodboard upload" on storage.objects;
create policy "moodboard upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'moodboard' and mb.upload_allowed(name));

drop policy if exists "moodboard read" on storage.objects;
create policy "moodboard read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'moodboard' and (mb.upload_allowed(name) or mb.deletable(name)));

drop policy if exists "moodboard delete" on storage.objects;
create policy "moodboard delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'moodboard' and mb.deletable(name));
