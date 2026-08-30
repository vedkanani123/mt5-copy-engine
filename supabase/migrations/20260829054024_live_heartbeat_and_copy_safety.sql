-- Live-state contract for MT5 terminals.
-- The browser treats last_heartbeat_at as a short lease; a missing lease is never online.
alter table public.trading_accounts
  add column if not exists last_state_at timestamptz;

create index if not exists trading_accounts_live_state_idx
  on public.trading_accounts(workspace_id, last_heartbeat_at desc);

-- Keep the database status aligned with the terminal flags on every authenticated EA post.
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
  v_device public.ea_devices;
  v_account public.trading_accounts;
  v_terminal_connected boolean;
  v_trade_allowed boolean;
  v_is_online boolean;
  v_balance numeric;
  v_equity numeric;
  v_open_pl numeric;
  v_open_positions integer;
  v_symbol text;
begin
  select * into v_device
  from public.ea_devices
  where account_id = p_account_id
    and credential_hash = encode(digest(p_token, 'sha256'), 'hex')
    and revoked_at is null;

  if v_device.id is null then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized device token');
  end if;

  select * into v_account from public.trading_accounts where id = p_account_id;

  v_terminal_connected := coalesce((p_state->>'terminalConnected')::boolean, true);
  v_trade_allowed := coalesce((p_state->>'tradeAllowed')::boolean, true);
  v_is_online := upper(coalesce(p_state->>'status', 'ONLINE')) = 'ONLINE'
                 and v_terminal_connected
                 and v_trade_allowed;

  v_balance := coalesce((p_state->>'balance')::numeric, v_account.balance, 0);
  v_equity := coalesce((p_state->>'equity')::numeric, v_account.equity, 0);
  v_open_pl := coalesce((p_state->>'openPL')::numeric, (p_state->>'open_pl')::numeric, 0);
  v_open_positions := coalesce((p_state->>'positionsTotal')::integer, (p_state->>'open_positions')::integer, 0);
  v_symbol := coalesce(p_state->>'symbol', v_account.symbol, 'XAUUSD');

  update public.trading_accounts
  set connection_status = case when v_is_online then 'ONLINE' else 'OFFLINE' end,
      last_heartbeat_at = now(),
      last_state_at = now(),
      balance = v_balance,
      equity = v_equity,
      open_pl = v_open_pl,
      open_positions = v_open_positions,
      symbol = v_symbol,
      account_number = coalesce(p_state->>'accountNumber', p_state->>'account_number', v_account.account_number),
      broker = coalesce(p_state->>'broker', p_state->>'accountCompany', v_account.broker),
      server = coalesce(p_state->>'server', p_state->>'accountServer', v_account.server),
      ea_version = coalesce(p_state->>'version', v_account.ea_version, '1.0.0')
  where id = p_account_id;

  insert into public.ea_states (account_id, workspace_id, state, updated_at)
  values (p_account_id, v_device.workspace_id, p_state, now())
  on conflict (account_id) do update set
    state = excluded.state,
    updated_at = excluded.updated_at;

  update public.ea_devices set last_seen_at = now() where id = v_device.id;

  return jsonb_build_object(
    'ok', true,
    'online', v_is_online,
    'status', case when v_is_online then 'ONLINE' else 'OFFLINE' end
  );
end;
$$;

revoke execute on function public.ea_post_state(uuid, text, jsonb) from public;
grant execute on function public.ea_post_state(uuid, text, jsonb) to anon, authenticated;

-- Make master event retries idempotent and fan out only to explicitly linked slaves.
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
  v_device public.ea_devices;
  v_master public.trading_accounts;
  v_slave record;
  v_inserted_event public.trade_events;
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
  select * into v_device
  from public.ea_devices
  where account_id = p_account_id
    and credential_hash = encode(digest(p_token, 'sha256'), 'hex')
    and revoked_at is null;

  if v_device.id is null then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized device token');
  end if;

  select * into v_master
  from public.trading_accounts
  where id = p_account_id and mode = 'MASTER';

  if v_master.id is null then
    return jsonb_build_object('ok', false, 'error', 'Master account role required');
  end if;

  if v_master.copy_status <> 'ACTIVE' then
    return jsonb_build_object('ok', false, 'error', 'Master copy broadcasting is paused');
  end if;

  if exists (
    select 1 from public.workspaces
    where id = v_master.workspace_id and emergency_stop = true
  ) then
    return jsonb_build_object('ok', false, 'error', 'Workspace emergency stop is active');
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

  insert into public.trade_events (
    workspace_id, master_account_id, event_id, master_position_id,
    action, symbol, side, volume, price, sl, tp, payload, sequence_number, event_timestamp
  ) values (
    v_master.workspace_id, v_master.id, v_event_id, v_master_ticket,
    v_action::public.trade_action, v_symbol, v_side, v_volume, v_price, v_sl, v_tp,
    coalesce(p_event, '{}'::jsonb),
    coalesce((p_event->>'sequence')::bigint, (extract(epoch from now()) * 1000)::bigint),
    now()
  )
  on conflict do nothing
  returning * into v_inserted_event;

  if v_inserted_event.id is null then
    return jsonb_build_object('ok', true, 'duplicate', true, 'event_id', v_event_id, 'slaves_notified', 0);
  end if;

  for v_slave in
    select * from public.trading_accounts
    where workspace_id = v_master.workspace_id
      and mode = 'SLAVE'
      and copy_status = 'ACTIVE'
      and master_account_id = v_master.id
  loop
    if v_action in ('OPEN_MARKET', 'CREATE_PENDING') then
      v_slave_cmd_action := 'COPY_OPEN';
    elsif v_action in ('MODIFY_SL', 'MODIFY_TP', 'MODIFY_SL_TP') then
      v_slave_cmd_action := 'COPY_MODIFY';
    elsif v_action in ('CLOSE_MARKET', 'PARTIAL_CLOSE') then
      v_slave_cmd_action := 'COPY_CLOSE';
    else
      v_slave_cmd_action := v_action;
    end if;

    insert into public.commands (workspace_id, account_id, action, payload, status)
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

  return jsonb_build_object('ok', true, 'duplicate', false, 'event_id', v_event_id, 'slaves_notified', v_slave_count);
end;
$$;

revoke execute on function public.publish_master_event(uuid, text, jsonb) from public;
grant execute on function public.publish_master_event(uuid, text, jsonb) to anon, authenticated;

-- Optional maintenance hook for pg_cron or an external scheduler. The UI still derives
-- liveness from the lease, so no Edge Function is required for correctness.
create or replace function public.expire_stale_ea_accounts(p_stale_after_seconds integer default 10)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update public.trading_accounts
  set connection_status = 'OFFLINE'
  where connection_status <> 'OFFLINE'
    and (last_heartbeat_at is null or last_heartbeat_at < now() - make_interval(secs => greatest(p_stale_after_seconds, 1)));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.expire_stale_ea_accounts(integer) from public, anon, authenticated;

-- Remove public RPC access from trigger-only and obsolete provisioning functions.
revoke execute on function public.broadcast_trade_event() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.sync_account_group() from public, anon, authenticated;
revoke execute on function public.register_ea_device(text, text, text, text, public.account_mode, text, text) from public, anon, authenticated;
revoke execute on function public.record_ea_heartbeat(text, numeric, numeric, numeric, integer, boolean, boolean, text) from public, anon, authenticated;
revoke execute on function public.publish_master_event(text, jsonb) from public, anon, authenticated;

-- Browser command creation is protected by authenticated RLS and does not need
-- SECURITY DEFINER or anonymous execution.
alter function public.create_bulk_command(uuid[], text, jsonb) security invoker;
revoke execute on function public.create_bulk_command(uuid[], text, jsonb) from anon;
