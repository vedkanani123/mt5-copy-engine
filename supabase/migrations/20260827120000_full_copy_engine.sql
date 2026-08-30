-- 1. Ensure ea_states table exists
create table if not exists public.ea_states (
  account_id uuid primary key references public.trading_accounts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2. Ensure commands table exists
create table if not exists public.commands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  client_id text,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','sent','done','failed','expired')),
  result_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  done_at timestamptz,
  expires_at timestamptz not null default (now() + interval '60 seconds')
);

-- Ensure additional columns on trading_accounts
alter table public.trading_accounts add column if not exists open_pl numeric default 0;
alter table public.trading_accounts add column if not exists open_positions integer default 0;
alter table public.trading_accounts add column if not exists symbol text default 'XAUUSD';
alter table public.trading_accounts add column if not exists risk_settings jsonb default '{"lot":0.01,"risk_usd":100,"rr":3.0,"custom_tp":200,"custom_tp_enabled":false}'::jsonb;
alter table public.trading_accounts add column if not exists partial_settings jsonb default '{"mode":"safe","partials_on":false,"second_on":false,"third_on":false,"pc1":30,"pc2":30,"pc3":40}'::jsonb;

-- Indexes
create index if not exists idx_commands_account_pending on public.commands(account_id, status, created_at) where status = 'pending';
create index if not exists idx_commands_account_created on public.commands(account_id, created_at desc);
create index if not exists idx_commands_workspace on public.commands(workspace_id, created_at desc);
create index if not exists idx_ea_states_workspace on public.ea_states(workspace_id);

-- Enable RLS
alter table public.ea_states enable row level security;
alter table public.commands enable row level security;

-- Policies
drop policy if exists "ea_states workspace members" on public.ea_states;
create policy "ea_states workspace members" on public.ea_states for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "commands workspace members" on public.commands;
create policy "commands workspace members" on public.commands for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Realtime for commands & states
alter publication supabase_realtime add table public.trading_accounts;
alter publication supabase_realtime add table public.ea_states;
alter publication supabase_realtime add table public.commands;
alter publication supabase_realtime add table public.trade_events;

-- RPC: create_bulk_command
create or replace function public.create_bulk_command(
  p_account_ids uuid[],
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_workspace_id uuid;
  v_inserted_count integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_cmd_id uuid;
begin
  if p_account_ids is null or array_length(p_account_ids, 1) = 0 then
    return jsonb_build_object('ok', false, 'error', 'No accounts specified');
  end if;

  foreach v_account_id in array p_account_ids
  loop
    select workspace_id into v_workspace_id from trading_accounts where id = v_account_id;
    if v_workspace_id is not null and public.is_workspace_member(v_workspace_id) then
      insert into commands (workspace_id, account_id, action, payload, status)
      values (v_workspace_id, v_account_id, p_action, coalesce(p_payload, '{}'::jsonb), 'pending')
      returning id into v_cmd_id;

      v_inserted_count := v_inserted_count + 1;
      v_results := v_results || jsonb_build_object('account_id', v_account_id, 'command_id', v_cmd_id);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'sent', v_inserted_count, 'commands', v_results);
end;
$$;
grant execute on function public.create_bulk_command(uuid[], text, jsonb) to authenticated;

-- RPC: ea_next_command
create or replace function public.ea_next_command(
  p_account_id uuid,
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device ea_devices;
  v_cmd commands;
begin
  -- Validate token
  select * into v_device from ea_devices
  where account_id = p_account_id
    and credential_hash = encode(digest(p_token, 'sha256'), 'hex')
    and revoked_at is null;

  if v_device.id is null then
    -- Check if token matches raw sha256 or pairing key directly
    select * into v_device from ea_devices
    where account_id = p_account_id
      and credential_hash = p_token
      and revoked_at is null;
  end if;

  if v_device.id is null then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized device token');
  end if;

  -- Lock and fetch oldest pending non-expired command
  select * into v_cmd from commands
  where account_id = p_account_id
    and status = 'pending'
    and expires_at > now()
  order by created_at asc
  limit 1
  for update skip locked;

  if v_cmd.id is not null then
    update commands
    set status = 'sent', sent_at = now()
    where id = v_cmd.id;

    return jsonb_build_object(
      'ok', true,
      'has_command', true,
      'command', jsonb_build_object(
        'id', v_cmd.id,
        'action', v_cmd.action,
        'payload', v_cmd.payload,
        'client_id', v_cmd.client_id,
        'created_at', v_cmd.created_at
      )
    );
  end if;

  return jsonb_build_object('ok', true, 'has_command', false);
end;
$$;
grant execute on function public.ea_next_command(uuid, text) to anon, authenticated;

-- RPC: ea_ack_command
create or replace function public.ea_ack_command(
  p_command_id uuid,
  p_account_id uuid,
  p_token text,
  p_status text default 'done',
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device ea_devices;
begin
  select * into v_device from ea_devices
  where account_id = p_account_id
    and (credential_hash = encode(digest(p_token, 'sha256'), 'hex') or credential_hash = p_token)
    and revoked_at is null;

  if v_device.id is null then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized device token');
  end if;

  update commands
  set status = case when p_status = 'failed' then 'failed' else 'done' end,
      done_at = now(),
      result_message = p_message
  where id = p_command_id and account_id = p_account_id;

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.ea_ack_command(uuid, uuid, text, text, text) to anon, authenticated;

-- RPC: ea_post_state
create or replace function public.ea_post_state(
  p_account_id uuid,
  p_token text,
  p_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device ea_devices;
  v_account trading_accounts;
  v_balance numeric;
  v_equity numeric;
  v_open_pl numeric;
  v_open_pos integer;
  v_symbol text;
  v_status text;
begin
  select * into v_device from ea_devices
  where account_id = p_account_id
    and (credential_hash = encode(digest(p_token, 'sha256'), 'hex') or credential_hash = p_token)
    and revoked_at is null;

  if v_device.id is null then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized device token');
  end if;

  select * into v_account from trading_accounts where id = p_account_id;

  v_status := coalesce(p_state->>'status', 'ONLINE');

  if v_status = 'OFFLINE' then
    update trading_accounts
    set connection_status = 'OFFLINE',
        last_heartbeat_at = null
    where id = p_account_id;

    insert into ea_states (account_id, workspace_id, state, updated_at)
    values (p_account_id, v_device.workspace_id, p_state, now())
    on conflict (account_id)
    do update set
      state = excluded.state,
      updated_at = now();

    return jsonb_build_object('ok', true, 'status', 'OFFLINE');
  end if;

  v_balance := coalesce((p_state->>'balance')::numeric, v_account.balance, 0);
  v_equity := coalesce((p_state->>'equity')::numeric, v_account.equity, 0);
  v_open_pl := coalesce((p_state->>'openPL')::numeric, (p_state->>'open_pl')::numeric, 0);
  v_open_pos := coalesce((p_state->>'positionsTotal')::integer, (p_state->>'open_positions')::integer, 0);
  v_symbol := coalesce(p_state->>'symbol', v_account.symbol, 'XAUUSD');

  -- Update trading_accounts
  update trading_accounts
  set connection_status = 'ONLINE',
      last_heartbeat_at = now(),
      balance = v_balance,
      equity = v_equity,
      open_pl = v_open_pl,
      open_positions = v_open_pos,
      symbol = v_symbol,
      account_number = coalesce(p_state->>'accountNumber', p_state->>'account_number', v_account.account_number),
      broker = coalesce(p_state->>'broker', p_state->>'accountCompany', v_account.broker),
      server = coalesce(p_state->>'server', p_state->>'accountServer', v_account.server),
      ea_version = coalesce(p_state->>'version', v_account.ea_version, '1.0.0')
  where id = p_account_id;

  -- Upsert ea_states
  insert into ea_states (account_id, workspace_id, state, updated_at)
  values (p_account_id, v_device.workspace_id, p_state, now())
  on conflict (account_id)
  do update set
    state = excluded.state,
    updated_at = now();

  -- Update last_seen
  update ea_devices set last_seen_at = now() where id = v_device.id;

  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.ea_post_state(uuid, text, jsonb) to anon, authenticated;

-- RPC: publish_master_event (With auto-fanout to active slave accounts!)
create or replace function public.publish_master_event(
  p_account_id uuid,
  p_token text,
  p_event jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device ea_devices;
  v_master trading_accounts;
  v_slave record;
  v_event_id text;
  v_action text;
  v_symbol text;
  v_side text;
  v_volume numeric;
  v_price numeric;
  v_sl numeric;
  v_tp numeric;
  v_sl_points numeric;
  v_tp_points numeric;
  v_master_ticket text;
  v_slave_cmd_action text;
  v_slave_count integer := 0;
begin
  select * into v_device from ea_devices
  where account_id = p_account_id
    and (credential_hash = encode(digest(p_token, 'sha256'), 'hex') or credential_hash = p_token)
    and revoked_at is null;

  if v_device.id is null then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized device token');
  end if;

  select * into v_master from trading_accounts where id = p_account_id and mode = 'MASTER';
  if v_master.id is null then
    return jsonb_build_object('ok', false, 'error', 'Master account role required');
  end if;

  v_event_id := coalesce(p_event->>'event_id', 'evt_' || encode(gen_random_bytes(8), 'hex'));
  v_action := coalesce(p_event->>'action', 'OPEN_MARKET');
  v_symbol := coalesce(p_event->>'symbol', v_master.symbol, 'XAUUSD');
  v_side := p_event->>'side';
  v_volume := coalesce((p_event->>'volume')::numeric, 0.01);
  v_price := (p_event->>'price')::numeric;
  v_sl := (p_event->>'sl')::numeric;
  v_tp := (p_event->>'tp')::numeric;
  v_sl_points := coalesce((p_event->>'sl_points')::numeric, 0);
  v_tp_points := coalesce((p_event->>'tp_points')::numeric, 0);
  v_master_ticket := coalesce(p_event->>'master_position_id', p_event->>'ticket', '0');

  -- Insert event record
  insert into trade_events (
    workspace_id, master_account_id, event_id, master_position_id,
    action, symbol, side, volume, price, sl, tp, payload, sequence_number, event_timestamp
  )
  values (
    v_device.workspace_id, p_account_id, v_event_id, v_master_ticket,
    v_action::trade_action, v_symbol, v_side, v_volume, v_price, v_sl, v_tp,
    coalesce(p_event, '{}'::jsonb),
    coalesce((p_event->>'sequence')::bigint, (extract(epoch from now()) * 1000)::bigint),
    now()
  )
  on conflict (event_id) do nothing;

  -- Fan-out: create command for each active slave account in the same workspace
  for v_slave in
    select * from trading_accounts
    where workspace_id = v_master.workspace_id
      and mode = 'SLAVE'
      and copy_status = 'ACTIVE'
      and (master_account_id = v_master.id or master_account_id is null or group_name = v_master.group_name or group_name = 'Default group' or v_master.group_name = 'Default group')
  loop
    -- Map master trade action to slave command
    if v_action in ('OPEN_MARKET', 'CREATE_PENDING') then
      v_slave_cmd_action := 'COPY_OPEN';
    elsif v_action in ('MODIFY_SL', 'MODIFY_TP', 'MODIFY_SL_TP') then
      v_slave_cmd_action := 'COPY_MODIFY';
    elsif v_action in ('CLOSE_MARKET', 'PARTIAL_CLOSE') then
      v_slave_cmd_action := 'COPY_CLOSE';
    else
      v_slave_cmd_action := v_action;
    end if;

    insert into commands (
      workspace_id, account_id, action, payload, status
    )
    values (
      v_master.workspace_id,
      v_slave.id,
      v_slave_cmd_action,
      jsonb_build_object(
        'event_id', v_event_id,
        'master_account_id', v_master.id,
        'master_ticket', v_master_ticket,
        'action', v_action,
        'symbol', v_symbol,
        'side', v_side,
        'volume', v_volume,
        'price', v_price,
        'sl', v_sl,
        'tp', v_tp,
        'sl_points', v_sl_points,
        'tp_points', v_tp_points,
        'risk_settings', v_slave.risk_settings,
        'payload', p_event
      ),
      'pending'
    );

    v_slave_count := v_slave_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'event_id', v_event_id, 'slaves_notified', v_slave_count);
end;
$$;
grant execute on function public.publish_master_event(uuid, text, jsonb) to anon, authenticated;
