-- =========================================================================
-- App "Control de Proveedores" - tablas AISLADAS (prefijo cp_).
-- No tocan ninguna tabla existente. Acceso solo via funciones RPC.
-- Proyecto Supabase: Control Partes Talleristas (hrxfctzncixxqmpfhskv)
-- =========================================================================

create table if not exists public.cp_config (
  key   text primary key,
  value text
);

create table if not exists public.cp_sessions (
  id           bigint generated always as identity primary key,
  supplier_name text not null,
  period       text,
  token        text not null unique,
  status       text not null default 'abierta',
  created_at   timestamptz not null default now(),
  submitted_at timestamptz
);

create table if not exists public.cp_items (
  id          bigint generated always as identity primary key,
  session_id  bigint not null references public.cp_sessions(id) on delete cascade,
  ord         int not null,
  descripcion text not null,
  stock_cajon numeric,
  stock_kg    numeric,
  estado      text,          -- null | correcto | incorrecto
  sp_cajon    numeric,       -- sin procesar (crudo)
  sp_kg       numeric,
  pr_cajon    numeric,       -- procesado
  pr_kg       numeric,
  comentario  text,
  updated_at  timestamptz
);

create index if not exists cp_items_session_idx on public.cp_items(session_id);

-- RLS activada y SIN policies -> anon/authenticated no acceden directo.
alter table public.cp_config   enable row level security;
alter table public.cp_sessions enable row level security;
alter table public.cp_items    enable row level security;

-- ---- Helper interno: verifica la clave de admin ----
create or replace function public.cp_is_admin(p_secret text)
returns boolean language sql security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.cp_config
    where key = 'admin_secret' and value = p_secret and p_secret is not null and p_secret <> ''
  );
$$;

-- ---- ADMIN ----
create or replace function public.cp_admin_login(p_secret text)
returns boolean language sql security definer set search_path = public, pg_temp as $$
  select public.cp_is_admin(p_secret);
$$;

create or replace function public.cp_admin_create_session(
  p_secret text, p_supplier text, p_period text, p_items jsonb
) returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_token text;
begin
  if not public.cp_is_admin(p_secret) then raise exception 'No autorizado'; end if;
  if coalesce(trim(p_supplier),'') = '' then raise exception 'Falta el proveedor'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Faltan items';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '');
  insert into public.cp_sessions(supplier_name, period, token)
  values (trim(p_supplier), nullif(trim(coalesce(p_period,'')),''), v_token)
  returning id into v_id;

  insert into public.cp_items(session_id, ord, descripcion, stock_cajon, stock_kg)
  select v_id, (t.idx - 1)::int,
         coalesce(nullif(trim(t.elem->>'descripcion'),''), 'Item '||t.idx),
         nullif(t.elem->>'stock_cajon','')::numeric,
         nullif(t.elem->>'stock_kg','')::numeric
  from jsonb_array_elements(p_items) with ordinality as t(elem, idx);

  return json_build_object('id', v_id, 'token', v_token);
end;
$$;

create or replace function public.cp_admin_list_sessions(p_secret text)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.cp_is_admin(p_secret) then raise exception 'No autorizado'; end if;
  return coalesce((
    select json_agg(row_to_json(x) order by x.id desc) from (
      select s.id, s.supplier_name, s.period, s.token, s.status, s.created_at, s.submitted_at,
        (select count(*) from public.cp_items i where i.session_id = s.id) as total_items,
        (select count(*) from public.cp_items i where i.session_id = s.id and i.estado is not null) as respondidos,
        (select count(*) from public.cp_items i where i.session_id = s.id and i.estado = 'incorrecto') as incorrectos
      from public.cp_sessions s
    ) x
  ), '[]'::json);
end;
$$;

create or replace function public.cp_admin_get_session(p_secret text, p_id bigint)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v json;
begin
  if not public.cp_is_admin(p_secret) then raise exception 'No autorizado'; end if;
  select json_build_object(
    'session', (select row_to_json(s) from public.cp_sessions s where s.id = p_id),
    'items', coalesce((select json_agg(row_to_json(i) order by i.ord)
                       from public.cp_items i where i.session_id = p_id), '[]'::json)
  ) into v;
  return v;
end;
$$;

create or replace function public.cp_admin_delete_session(p_secret text, p_id bigint)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.cp_is_admin(p_secret) then raise exception 'No autorizado'; end if;
  delete from public.cp_sessions where id = p_id;
end;
$$;

-- ---- PROVEEDOR (acceso por token) ----
create or replace function public.cp_get(p_token text)
returns json language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v json;
begin
  select id into v_id from public.cp_sessions where token = p_token;
  if v_id is null then raise exception 'Link inválido'; end if;
  select json_build_object(
    'session', (select json_build_object('supplier_name', s.supplier_name, 'period', s.period, 'status', s.status)
                from public.cp_sessions s where s.id = v_id),
    'items', coalesce((select json_agg(json_build_object(
        'id', i.id, 'ord', i.ord, 'descripcion', i.descripcion,
        'stock_cajon', i.stock_cajon, 'stock_kg', i.stock_kg,
        'estado', i.estado, 'sp_cajon', i.sp_cajon, 'sp_kg', i.sp_kg,
        'pr_cajon', i.pr_cajon, 'pr_kg', i.pr_kg, 'comentario', i.comentario
      ) order by i.ord) from public.cp_items i where i.session_id = v_id), '[]'::json)
  ) into v;
  return v;
end;
$$;

create or replace function public.cp_save(p_token text, p_item_id bigint, p_patch jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_session public.cp_sessions; v_estado text;
begin
  select * into v_session from public.cp_sessions where token = p_token;
  if not found then raise exception 'Link inválido'; end if;
  if v_session.status = 'enviada' then raise exception 'El conteo ya fue enviado'; end if;

  perform 1 from public.cp_items where id = p_item_id and session_id = v_session.id;
  if not found then raise exception 'Item no encontrado'; end if;

  select estado into v_estado from public.cp_items where id = p_item_id;

  if p_patch ? 'estado' then
    if (p_patch->>'estado') not in ('correcto','incorrecto') then raise exception 'Estado inválido'; end if;
    v_estado := p_patch->>'estado';
    update public.cp_items set estado = v_estado, updated_at = now() where id = p_item_id;
    if v_estado = 'correcto' then
      update public.cp_items
        set sp_cajon=null, sp_kg=null, pr_cajon=null, pr_kg=null, comentario=null, updated_at=now()
        where id = p_item_id;
    end if;
  end if;

  if v_estado is null then raise exception 'Primero marcá Correcto o Incorrecto'; end if;

  if v_estado = 'incorrecto' and coalesce(p_patch->>'estado','') <> 'correcto' then
    if p_patch ? 'sp_cajon'   then update public.cp_items set sp_cajon = nullif(p_patch->>'sp_cajon','')::numeric, updated_at=now() where id=p_item_id; end if;
    if p_patch ? 'sp_kg'      then update public.cp_items set sp_kg    = nullif(p_patch->>'sp_kg','')::numeric,    updated_at=now() where id=p_item_id; end if;
    if p_patch ? 'pr_cajon'   then update public.cp_items set pr_cajon = nullif(p_patch->>'pr_cajon','')::numeric, updated_at=now() where id=p_item_id; end if;
    if p_patch ? 'pr_kg'      then update public.cp_items set pr_kg    = nullif(p_patch->>'pr_kg','')::numeric,    updated_at=now() where id=p_item_id; end if;
    if p_patch ? 'comentario' then update public.cp_items set comentario = nullif(left(coalesce(p_patch->>'comentario',''),500),''), updated_at=now() where id=p_item_id; end if;
  end if;
end;
$$;

create or replace function public.cp_submit(p_token text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.cp_sessions set status='enviada', submitted_at=now()
  where token = p_token and status <> 'enviada';
  if not found then
    if not exists (select 1 from public.cp_sessions where token = p_token) then
      raise exception 'Link inválido';
    end if;
  end if;
end;
$$;

-- ---- Permisos: revocar todo directo, permitir SOLO ejecutar las RPC publicas ----
revoke all on public.cp_config, public.cp_sessions, public.cp_items from anon, authenticated;

revoke all on function
  public.cp_is_admin(text),
  public.cp_admin_login(text),
  public.cp_admin_create_session(text, text, text, jsonb),
  public.cp_admin_list_sessions(text),
  public.cp_admin_get_session(text, bigint),
  public.cp_admin_delete_session(text, bigint),
  public.cp_get(text),
  public.cp_save(text, bigint, jsonb),
  public.cp_submit(text)
from public;

-- cp_is_admin queda interno (lo usan las funciones como owner, no el cliente).
revoke execute on function public.cp_is_admin(text) from anon, authenticated;

grant execute on function
  public.cp_admin_login(text),
  public.cp_admin_create_session(text, text, text, jsonb),
  public.cp_admin_list_sessions(text),
  public.cp_admin_get_session(text, bigint),
  public.cp_admin_delete_session(text, bigint),
  public.cp_get(text),
  public.cp_save(text, bigint, jsonb),
  public.cp_submit(text)
to anon, authenticated;
