-- Account-level copy: never invent XAUUSD, never duplicate logical events.

create unique index if not exists trade_events_logical_id
  on public.trade_events (event_id);

create or replace function public.publish_master_event(
  p_account_id uuid,
  p_token text,
  p_event jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
    and credential_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
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

  v_symbol := nullif(p_event->>'symbol', '');
  if v_symbol is null then
    return jsonb_build_object('ok', false, 'error', 'Account-level copy requires the real trade symbol');
  end if;

  v_event_id := coalesce(nullif(p_event->>'event_id', ''), 'evt_' || encode(gen_random_bytes(8), 'hex'));
  v_action := coalesce(p_event->>'action', 'OPEN_MARKET');
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
  on conflict (event_id) do nothing
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
