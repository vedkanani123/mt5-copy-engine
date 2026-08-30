create or replace function public.ea_post_state(
  p_account_id uuid,
  p_token text,
  p_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
    and credential_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and revoked_at is null;

  if v_device.id is null then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized device token');
  end if;

  select * into v_account
  from public.trading_accounts
  where id = p_account_id;

  v_terminal_connected := coalesce((p_state->>'terminalConnected')::boolean, false);
  v_trade_allowed := coalesce((p_state->>'tradeAllowed')::boolean, false)
    and coalesce((p_state->>'terminalTradeAllowed')::boolean, false)
    and coalesce((p_state->>'algoTradingAllowed')::boolean, false)
    and coalesce((p_state->>'accountTradeAllowed')::boolean, false);
  v_is_online := upper(coalesce(p_state->>'status', 'OFFLINE')) = 'ONLINE'
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
