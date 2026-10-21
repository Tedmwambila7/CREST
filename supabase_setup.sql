-- =====================================================================
-- CREST ACADEMY — Supabase setup  (run ONCE in Supabase > SQL Editor)
-- Before you click RUN, edit the ADMIN LOGIN lines near the bottom:
--   1) the admin NAME   (lowercase, e.g. sir taydayo)
--   2) the admin PASSWORD (your own strong password)
-- Safe to run again later: it will not delete data.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- tables (locked: the website can only use the functions below) ----------
create table if not exists crest_settings (key text primary key, value text not null);
create table if not exists crest_students (
  phone text primary key, name text not null, pass_hash text not null,
  created_at timestamptz not null default now());
create table if not exists crest_sessions (
  token text primary key,
  phone text not null references crest_students(phone) on delete cascade,
  created_at timestamptz not null default now());
create table if not exists crest_items (          -- chat messages + assignments/grades/submissions
  id text primary key, coll text not null, phone text, ts bigint not null, data jsonb not null);
create index if not exists crest_items_coll_ts on crest_items (coll, ts);
create table if not exists crest_kv (key text primary key, value jsonb not null);   -- book catalogue

alter table crest_settings enable row level security;
alter table crest_students enable row level security;
alter table crest_sessions enable row level security;
alter table crest_items    enable row level security;
alter table crest_kv       enable row level security;
revoke all on crest_settings, crest_students, crest_sessions, crest_items, crest_kv from anon, authenticated;

-- ---------- private helpers ----------
create or replace function crest_is_admin(p_key text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from crest_settings
                 where key = 'admin_key' and value = crypt(coalesce(p_key, ''), value));
$$;

create or replace function crest_need_admin(p_key text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not crest_is_admin(p_key) then raise exception 'Not allowed'; end if;
end $$;

create or replace function crest_me(p_token text) returns text
language sql stable security definer set search_path = public, extensions as $$
  select phone from crest_sessions where token = p_token;
$$;

create or replace function crest_trim_chat() returns void
language sql security definer set search_path = public, extensions as $$
  delete from crest_items where coll = 'chat' and id not in
    (select id from crest_items where coll = 'chat' order by ts desc limit 250);
$$;

revoke all on function crest_is_admin(text), crest_need_admin(text), crest_me(text), crest_trim_chat() from public, anon, authenticated;

-- ---------- sign-in ----------
create or replace function admin_check(p_key text) returns boolean
language sql security definer set search_path = public, extensions as $$
  select crest_is_admin(p_key);
$$;

create or replace function student_login(p_name text, p_phone text, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s crest_students; t text;
begin
  select * into s from crest_students where phone = regexp_replace(coalesce(p_phone,''), '[^0-9+]', '', 'g');
  if not found then return null; end if;
  if s.pass_hash <> crypt(coalesce(p_password,''), s.pass_hash) then return null; end if;
  if lower(regexp_replace(trim(s.name), '\s+', ' ', 'g')) <> lower(regexp_replace(trim(coalesce(p_name,'')), '\s+', ' ', 'g')) then return null; end if;
  t := encode(gen_random_bytes(24), 'hex');
  insert into crest_sessions (token, phone) values (t, s.phone);
  return jsonb_build_object('name', s.name, 'phone', s.phone, 'token', t);
end $$;

create or replace function student_me(p_token text) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object('name', s.name, 'phone', s.phone)
  from crest_sessions k join crest_students s on s.phone = k.phone where k.token = p_token;
$$;

create or replace function student_logout(p_token text) returns boolean
language sql security definer set search_path = public, extensions as $$
  with d as (delete from crest_sessions where token = p_token returning 1) select true;
$$;

-- ---------- books ----------
create or replace function get_books(p_token text default null, p_key text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not (crest_is_admin(p_key) or crest_me(p_token) is not null) then raise exception 'Session expired'; end if;
  return coalesce((select value from crest_kv where key = 'books'), '[]'::jsonb);
end $$;

create or replace function admin_set_books(p_key text, p_books jsonb) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform crest_need_admin(p_key);
  insert into crest_kv (key, value) values ('books', coalesce(p_books, '[]'::jsonb))
  on conflict (key) do update set value = excluded.value;
  return true;
end $$;

-- ---------- student: chat + work ----------
create or replace function student_items(p_token text, p_coll text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare me text := crest_me(p_token);
begin
  if me is null then raise exception 'Session expired'; end if;
  if p_coll = 'chat' then
    return coalesce((select jsonb_agg(data order by ts) from crest_items
      where coll = 'chat' and (phone = me or
        ((data->>'isTeacher') = 'true' and (coalesce(data->>'to','') in ('', 'all') or data->>'to' = me)))), '[]'::jsonb);
  elsif p_coll = 'work' then
    return coalesce((select jsonb_agg(data order by ts) from crest_items
      where coll = 'work' and (
        ((data->>'kind') in ('assignment', 'grade') and (data->>'to' in ('all', me)))
        or ((data->>'kind') = 'submission' and phone = me))), '[]'::jsonb);
  end if;
  return '[]'::jsonb;
end $$;

create or replace function student_put_item(p_token text, p_coll text, p_item jsonb) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare me text := crest_me(p_token); nm text; it jsonb;
begin
  if me is null then raise exception 'Session expired'; end if;
  if p_coll not in ('chat', 'work') then raise exception 'Not allowed'; end if;
  if length(p_item::text) > 20000 then raise exception 'Message too large'; end if;
  select name into nm from crest_students where phone = me;
  it := p_item || jsonb_build_object('phone', me);
  if p_coll = 'chat' then
    it := it || jsonb_build_object('isTeacher', false);
  else
    if coalesce(p_item->>'kind', '') <> 'submission' then raise exception 'Not allowed'; end if;
    it := it || jsonb_build_object('name', nm);
  end if;
  insert into crest_items (id, coll, phone, ts, data)
  values (it->>'id', p_coll, me, coalesce((it->>'ts')::bigint, (extract(epoch from now()) * 1000)::bigint), it)
  on conflict (id) do nothing;
  if p_coll = 'chat' then perform crest_trim_chat(); end if;
  return true;
end $$;

create or replace function request_password_reset(p_phone text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare s crest_students; v_ts bigint := (extract(epoch from now()) * 1000)::bigint; v_id text;
begin
  select * into s from crest_students where phone = regexp_replace(coalesce(p_phone,''), '[^0-9+]', '', 'g');
  if not found then return false; end if;
  v_id := 'm' || v_ts::text || substr(md5(random()::text), 1, 4);
  insert into crest_items (id, coll, phone, ts, data) values (v_id, 'chat', s.phone, v_ts,
    jsonb_build_object('id', v_id, 'phone', s.phone, 'sender', s.name, 'isTeacher', false, 'ts', v_ts,
      'time', to_char(now() at time zone 'utc', 'HH24:MI'),
      'message', '🔑 PASSWORD RESET REQUEST from ' || s.name || ' (' || s.phone || ')'));
  perform crest_trim_chat();
  return true;
end $$;

-- ---------- admin ----------
create or replace function admin_students(p_key text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform crest_need_admin(p_key);
  return coalesce((select jsonb_agg(jsonb_build_object('name', name, 'phone', phone,
           'created', (extract(epoch from created_at) * 1000)::bigint) order by name) from crest_students), '[]'::jsonb);
end $$;

create or replace function admin_add_student(p_key text, p_name text, p_phone text, p_password text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_phone text := regexp_replace(coalesce(p_phone,''), '[^0-9+]', '', 'g');
begin
  perform crest_need_admin(p_key);
  if length(trim(coalesce(p_name,''))) < 3 or length(coalesce(p_password,'')) < 6
     or length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 7 then raise exception 'Invalid details'; end if;
  if exists (select 1 from crest_students where phone = v_phone) then return 'exists'; end if;
  insert into crest_students (phone, name, pass_hash)
  values (v_phone, regexp_replace(trim(p_name), '\s+', ' ', 'g'), crypt(p_password, gen_salt('bf')));
  return 'ok';
end $$;

create or replace function admin_reset_password(p_key text, p_phone text, p_password text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform crest_need_admin(p_key);
  if length(coalesce(p_password,'')) < 6 then raise exception 'Password must be at least 6 characters'; end if;
  update crest_students set pass_hash = crypt(p_password, gen_salt('bf')) where phone = p_phone;
  delete from crest_sessions where phone = p_phone;     -- signs the old device out
  return found;
end $$;

create or replace function admin_delete_student(p_key text, p_phone text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform crest_need_admin(p_key);
  delete from crest_students where phone = p_phone;     -- sessions are removed automatically
  return true;
end $$;

create or replace function admin_items(p_key text, p_coll text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform crest_need_admin(p_key);
  return coalesce((select jsonb_agg(data order by ts) from crest_items where coll = p_coll), '[]'::jsonb);
end $$;

create or replace function admin_put_item(p_key text, p_coll text, p_item jsonb) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform crest_need_admin(p_key);
  if p_coll not in ('chat', 'work') then raise exception 'Not allowed'; end if;
  insert into crest_items (id, coll, phone, ts, data)
  values (p_item->>'id', p_coll, p_item->>'phone',
          coalesce((p_item->>'ts')::bigint, (extract(epoch from now()) * 1000)::bigint), p_item)
  on conflict (id) do update set data = excluded.data;
  if p_coll = 'chat' then perform crest_trim_chat(); end if;
  return true;
end $$;

create or replace function admin_delete_item(p_key text, p_id text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform crest_need_admin(p_key);
  delete from crest_items where id = p_id;
  return true;
end $$;

-- ===================== ADMIN LOGIN — EDIT THESE TWO THINGS =====================
-- Format is:  'admin name in lowercase|your password'
insert into crest_settings (key, value)
values ('admin_key', extensions.crypt('sir taydayo|crest2026', extensions.gen_salt('bf')))
on conflict (key) do update set value = excluded.value;
-- ===============================================================================
