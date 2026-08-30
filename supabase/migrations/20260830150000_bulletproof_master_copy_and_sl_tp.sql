-- Bulletproof Master Trade Fanout & Point-Based SL/TP Synchronization

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
  v_child record;
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
  v_sl_distance numeric;
  v_tp_distance numeric;
  v_master_ticket text;
  v_slave_cmd_action text;
  v_slave_count integer := 0;
  v_queue uuid[];
  v_visited uuid[];
  v_parent uuid;
  v_was_duplicate boolean := false;
begin
  -- 1. Validate device credentials
  select * into v_device
  from public.ea_devices
  where account_id = p_account_id
    and credential_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and revoked_at is null;

  if v_device.id is null then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized device token');
  end if;

  -- 2. Validate master account
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
  v_sl := coalesce((p_event->>'sl')::numeric, 0);
  v_tp := coalesce((p_event->>'tp')::numeric, 0);
  v_sl_points := coalesce((p_event->>'sl_points')::numeric, 0);
  v_tp_points := coalesce((p_event->>'tp_points')::numeric, 0);
  v_sl_distance := coalesce((p_event->>'sl_distance')::numeric, 0);
  v_tp_distance := coalesce((p_event->>'tp_distance')::numeric, 0);
  v_master_ticket := coalesce(p_event->>'master_position_id', p_event->>'ticket', '0');

  -- 3. Durable trade event record
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
    v_was_duplicate := true;
    select * into v_inserted_event
    from public.trade_events
    where event_id = v_event_id;
  end if;

  -- 4. Map action to slave command
  if v_action in ('OPEN_MARKET', 'CREATE_PENDING') then
    v_slave_cmd_action := 'COPY_OPEN';
  elsif v_action in ('MODIFY_SL', 'MODIFY_TP', 'MODIFY_SL_TP') then
    v_slave_cmd_action := 'COPY_MODIFY';
  elsif v_action in ('CLOSE_MARKET', 'PARTIAL_CLOSE') then
    v_slave_cmd_action := 'COPY_CLOSE';
  else
    v_slave_cmd_action := v_action;
  end if;

  -- 5. Fan out to all connected slaves (and nested master trees)
  v_queue := array[v_master.id];
  v_visited := array[v_master.id];

  while coalesce(array_length(v_queue, 1), 0) > 0 loop
    v_parent := v_queue[1];
    if array_length(v_queue, 1) = 1 then
      v_queue := array[]::uuid[];
    else
      v_queue := v_queue[2:array_length(v_queue, 1)];
    end if;

    for v_child in
      select *
      from public.trading_accounts
      where workspace_id = v_master.workspace_id
        and id <> v_master.id
        and (
          master_account_id = v_parent
          or (
            v_parent = v_master.id
            and mode = 'SLAVE'
            and master_account_id is null
            and (
              select count(*) from public.trading_accounts m
              where m.workspace_id = v_master.workspace_id and m.mode = 'MASTER'
            ) = 1
          )
        )
        and not (id = any (v_visited))
    loop
      v_visited := v_visited || v_child.id;
      v_queue := v_queue || v_child.id;

      if v_child.copy_status <> 'ACTIVE' then
        continue;
      end if;

      if exists (
        select 1 from public.commands c
        where c.account_id = v_child.id
          and c.payload->>'event_id' = v_event_id
          and c.action = v_slave_cmd_action
      ) then
        v_slave_count := v_slave_count + 1;
        continue;
      end if;

      insert into public.commands (workspace_id, account_id, action, payload, status)
      values (
        v_master.workspace_id,
        v_child.id,
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
          'sl_distance', v_sl_distance,
          'tp_distance', v_tp_distance,
          'mode', coalesce(v_child.risk_settings->>'mode', 'MULTIPLIER'),
          'multiplier', coalesce((v_child.risk_settings->>'multiplier')::numeric, 1),
          'lot', coalesce((v_child.risk_settings->>'lot')::numeric, 0.01),
          'risk_usd', coalesce((v_child.risk_settings->>'risk_usd')::numeric, 100),
          'risk_percent', coalesce((v_child.risk_settings->>'risk_percent')::numeric, 1),
          'risk_settings', v_child.risk_settings,
          'payload', p_event
        ),
        'pending'
      );
      v_slave_count := v_slave_count + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'duplicate', v_was_duplicate,
    'event_id', v_event_id,
    'slaves_notified', v_slave_count
  );
end;
$$;

create or replace function public.ea_next_command(
  p_account_id uuid,
  p_token text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_device public.ea_devices;
  v_account public.trading_accounts;
  v_cmd public.commands;
  v_payload jsonb;
begin
  select * into v_device
  from public.ea_devices
  where account_id = p_account_id
    and credential_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and revoked_at is null;

  if v_device.id is null then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized device token');
  end if;

  select * into v_account
  from public.trading_accounts
  where id = p_account_id;

  if v_account.id is null then
    return jsonb_build_object('ok', false, 'error', 'Invalid account ID');
  end if;

  if v_account.copy_status <> 'ACTIVE' then
    update public.commands c
    set status = 'expired',
        result_message = 'Copy trading is OFF on this account; queued master trade was skipped.'
    where c.account_id = v_account.id
      and c.status = 'pending'
      and c.action in ('COPY_OPEN', 'COPY_MODIFY', 'COPY_CLOSE');
  end if;

  select * into v_cmd
  from public.commands c
  where c.account_id = p_account_id
    and c.status = 'pending'
    and (c.expires_at is null or c.expires_at > now())
  order by c.created_at asc
  limit 1
  for update skip locked;

  if v_cmd.id is not null then
    update public.commands
    set status = 'sent', sent_at = now()
    where id = v_cmd.id;

    v_payload := coalesce(v_cmd.payload, '{}'::jsonb);

    return jsonb_build_object(
      'ok', true,
      'has_command', true,
      'id', v_cmd.id,
      'action', v_cmd.action,
      'payload', v_payload,
      'event_id', v_payload->>'event_id',
      'symbol', coalesce(nullif(v_payload->>'symbol', ''), v_account.symbol),
      'side', v_payload->>'side',
      'volume', coalesce((v_payload->>'volume')::numeric, (v_payload->>'lot')::numeric, 0.01),
      'price', (v_payload->>'price')::numeric,
      'sl', coalesce((v_payload->>'sl')::numeric, 0),
      'tp', coalesce((v_payload->>'tp')::numeric, 0),
      'sl_points', coalesce((v_payload->>'sl_points')::numeric, 0),
      'tp_points', coalesce((v_payload->>'tp_points')::numeric, 0),
      'sl_distance', coalesce((v_payload->>'sl_distance')::numeric, 0),
      'tp_distance', coalesce((v_payload->>'tp_distance')::numeric, 0),
      'order_type', coalesce(v_payload->>'order_type', 'MARKET'),
      'ticket', (v_payload->>'ticket')::numeric,
      'master_ticket', coalesce((v_payload->>'master_ticket')::numeric, 0),
      'mode', v_payload->>'mode',
      'multiplier', coalesce((v_payload->>'multiplier')::numeric, 1),
      'lot', coalesce((v_payload->>'lot')::numeric, 0.01),
      'risk_usd', coalesce((v_payload->>'risk_usd')::numeric, 100),
      'risk_percent', coalesce((v_payload->>'risk_percent')::numeric, 1)
    );
  end if;

  return jsonb_build_object('ok', true, 'has_command', false);
end;
$$;

revoke execute on function public.publish_master_event(uuid, text, jsonb) from public;
grant execute on function public.publish_master_event(uuid, text, jsonb) to anon, authenticated;
revoke execute on function public.ea_next_command(uuid, text) from public;
grant execute on function public.ea_next_command(uuid, text) to anon, authenticated;
