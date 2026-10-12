-- =====================================================================================
-- db/admin_database_management.sql
-- Admin database management RPCs for table browsing, structure viewing, and SQL execution
-- Safe to re-run. All functions use SECURITY DEFINER and admin role checks.
-- =====================================================================================

-- Helper: Check if caller is admin
create or replace function public._caller_is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'admin'::app_role)
     or public.is_super_admin(auth.uid())
$$;

-- -------------------------------------------------------------------------------------
-- 1. GET TABLE STRUCTURE
-- Returns column information for a given table
-- -------------------------------------------------------------------------------------
create or replace function public.admin_get_table_structure(p_table_name text)
returns table (
  column_name text,
  data_type text,
  is_nullable text,
  column_default text,
  is_primary_key boolean,
  is_foreign_key boolean,
  references_table text
)
language sql stable security definer set search_path = public as $$
  select
    c.column_name,
    c.data_type,
    c.is_nullable,
    c.column_default,
    coalesce(pk.column_name is not null, false) as is_primary_key,
    coalesce(fk.column_name is not null, false) as is_foreign_key,
    fk.foreign_table_name as references_table
  from information_schema.columns c
  left join (
    select kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
    where tc.table_name = p_table_name
      and tc.constraint_type = 'PRIMARY KEY'
      and tc.table_schema = 'public'
  ) pk on c.column_name = pk.column_name
  left join (
    select
      kcu.column_name,
      ccu.table_name as foreign_table_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
    where tc.table_name = p_table_name
      and tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
  ) fk on c.column_name = fk.column_name
  where c.table_name = p_table_name
    and c.table_schema = 'public'
    and public._caller_is_admin()
  order by c.ordinal_position;
$$;

grant execute on function public.admin_get_table_structure(text) to authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 2. EXECUTE SQL (SAFE)
-- Executes a SQL query and returns results
-- WARNING: This is powerful - ensure only admins can use it
-- -------------------------------------------------------------------------------------
create or replace function public.admin_execute_sql(p_query text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
begin
  -- Admin check
  if not public._caller_is_admin() then
    raise exception 'Permission denied: admin role required';
  end if;

  -- Basic SQL injection prevention - only allow SELECT
  if not (upper(trim(p_query)) like 'SELECT%') then
    raise exception 'Only SELECT queries are allowed for safety';
  end if;

  -- Execute query and capture results
  execute 'select jsonb_agg(row_to_json(t)) from (' || p_query || ') t' into result;

  return result;
exception
  when others then
    return jsonb_build_object(
      'error', sqlerrm,
      'detail', sqlstate
    );
end;
$$;

grant execute on function public.admin_execute_sql(text) to authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 3. LIST ALL TABLES
-- Returns a list of all tables in the public schema
-- -------------------------------------------------------------------------------------
create or replace function public.admin_list_tables()
returns table (table_name text, row_count bigint)
language sql stable security definer set search_path = public as $$
  select
    t.table_name,
    coalesce(s.n_tup_ins + s.n_tup_upd + s.n_tup_del, 0) as row_count
  from information_schema.tables t
  left join pg_stat_user_tables s
    on s.schemaname = t.table_schema
    and s.relname = t.table_name
  where t.table_schema = 'public'
    and t.table_type = 'BASE TABLE'
    and public._caller_is_admin()
  order by t.table_name;
$$;

grant execute on function public.admin_list_tables() to authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 4. GET TABLE ROW COUNT
-- Returns the number of rows in a table
-- -------------------------------------------------------------------------------------
create or replace function public.admin_get_table_row_count(p_table_name text)
returns bigint
language sql stable security definer set search_path = public as $$
  select count(*)
  from information_schema.tables t
  where t.table_name = p_table_name
    and t.table_schema = 'public'
    and public._caller_is_admin();
$$;

grant execute on function public.admin_get_table_row_count(text) to authenticated, service_role;
