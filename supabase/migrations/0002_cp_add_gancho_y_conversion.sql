-- Agrega el factor de conversión (kg por cajón) y el estado "en gancho".
alter table public.cp_items add column if not exists kg_x_cajon numeric;
alter table public.cp_items add column if not exists gn_cajon numeric;  -- en gancho (proceso)
alter table public.cp_items add column if not exists gn_kg    numeric;

-- Recrear cp_admin_create_session para guardar kg_x_cajon.
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

  insert into public.cp_items(session_id, ord, descripcion, stock_cajon, stock_kg, kg_x_cajon)
  select v_id, (t.idx - 1)::int,
         coalesce(nullif(trim(t.elem->>'descripcion'),''), 'Item '||t.idx),
         nullif(t.elem->>'stock_cajon','')::numeric,
         nullif(t.elem->>'stock_kg','')::numeric,
         nullif(t.elem->>'kg_x_cajon','')::numeric
  from jsonb_array_elements(p_items) with ordinality as t(elem, idx);

  return json_build_object('id', v_id, 'token', v_token);
end;
$$;

-- Recrear cp_get para devolver kg_x_cajon y gn_*.
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
        'stock_cajon', i.stock_cajon, 'stock_kg', i.stock_kg, 'kg_x_cajon', i.kg_x_cajon,
        'estado', i.estado,
        'sp_cajon', i.sp_cajon, 'sp_kg', i.sp_kg,
        'gn_cajon', i.gn_cajon, 'gn_kg', i.gn_kg,
        'pr_cajon', i.pr_cajon, 'pr_kg', i.pr_kg, 'comentario', i.comentario
      ) order by i.ord) from public.cp_items i where i.session_id = v_id), '[]'::json)
  ) into v;
  return v;
end;
$$;

-- Recrear cp_save para aceptar gn_cajon/gn_kg y limpiarlos al marcar "correcto".
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
        set sp_cajon=null, sp_kg=null, gn_cajon=null, gn_kg=null, pr_cajon=null, pr_kg=null,
            comentario=null, updated_at=now()
        where id = p_item_id;
    end if;
  end if;

  if v_estado is null then raise exception 'Primero marcá Correcto o Incorrecto'; end if;

  if v_estado = 'incorrecto' and coalesce(p_patch->>'estado','') <> 'correcto' then
    if p_patch ? 'sp_cajon'   then update public.cp_items set sp_cajon = nullif(p_patch->>'sp_cajon','')::numeric, updated_at=now() where id=p_item_id; end if;
    if p_patch ? 'sp_kg'      then update public.cp_items set sp_kg    = nullif(p_patch->>'sp_kg','')::numeric,    updated_at=now() where id=p_item_id; end if;
    if p_patch ? 'gn_cajon'   then update public.cp_items set gn_cajon = nullif(p_patch->>'gn_cajon','')::numeric, updated_at=now() where id=p_item_id; end if;
    if p_patch ? 'gn_kg'      then update public.cp_items set gn_kg    = nullif(p_patch->>'gn_kg','')::numeric,    updated_at=now() where id=p_item_id; end if;
    if p_patch ? 'pr_cajon'   then update public.cp_items set pr_cajon = nullif(p_patch->>'pr_cajon','')::numeric, updated_at=now() where id=p_item_id; end if;
    if p_patch ? 'pr_kg'      then update public.cp_items set pr_kg    = nullif(p_patch->>'pr_kg','')::numeric,    updated_at=now() where id=p_item_id; end if;
    if p_patch ? 'comentario' then update public.cp_items set comentario = nullif(left(coalesce(p_patch->>'comentario',''),500),''), updated_at=now() where id=p_item_id; end if;
  end if;
end;
$$;
