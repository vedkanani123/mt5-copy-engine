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

  -- Copy OFF means no queued master trade may be executed on this slave.
  -- Expire blocked copy commands so re-enabling later cannot replay stale
  -- orders. Direct/manual commands remain available.
  if v_account.mode = 'SLAVE' then
    update public.commands c
    set status = 'expired',
        result_message = 'Copy trading is OFF; queued master trade was skipped.'
    where c.account_id = v_account.id
      and c.status = 'pending'
      and c.action in ('COPY_OPEN', 'COPY_MODIFY', 'COPY_CLOSE')
      and (
        v_account.copy_status <> 'ACTIVE'
        or not exists (
          select 1
          from public.trading_accounts m
          where m.id = v_account.master_account_id
            and m.mode = 'MASTER'
            and m.copy_status = 'ACTIVE'
        )
      );
  end if;

  select * into v_cmd
  from public.commands c
  where c.account_id = p_account_id
    and c.status = 'pending'
    and c.expires_at > now()
    and (
      v_account.mode = 'MASTER'
      or c.action not in ('COPY_OPEN', 'COPY_MODIFY', 'COPY_CLOSE')
    )
  order by c.created_at asc
  limit 1
  for update skip locked;

  if v_cmd.id is not null then
    update public.commands
    set status = 'sent', sent_at = now()
    where id = v_cmd.id;

    return jsonb_build_object(
      'ok', true,
      'has_command', true,
      'id', v_cmd.id,
      'action', v_cmd.action,
      'payload', v_cmd.payload,
      'symbol', coalesce(v_cmd.payload->>'symbol', v_account.symbol, 'XAUUSD'),
      'side', v_cmd.payload->>'side',
      'volume', coalesce((v_cmd.payload->>'volume')::numeric, (v_cmd.payload->>'lot')::numeric, 0.01),
      'price', (v_cmd.payload->>'price')::numeric,
      'sl', (v_cmd.payload->>'sl')::numeric,
      'tp', (v_cmd.payload->>'tp')::numeric,
      'order_type', coalesce(v_cmd.payload->>'order_type', 'MARKET'),
      'ticket', (v_cmd.payload->>'ticket')::numeric,
      'master_ticket', (v_cmd.payload->>'master_ticket')::numeric
    );
  end if;

  return jsonb_build_object('ok', true, 'has_command', false);
end;
$$;
