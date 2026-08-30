-- Copy commands must live long enough for a slave EA to poll them.
alter table public.commands
  alter column expires_at set default (now() + interval '15 minutes');

update public.commands
set expires_at = now() + interval '15 minutes'
where status = 'pending'
  and expires_at < now() + interval '1 minute';

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
      insert into commands (workspace_id, account_id, action, payload, status, expires_at)
      values (
        v_workspace_id,
        v_account_id,
        p_action,
        coalesce(p_payload, '{}'::jsonb),
        'pending',
        now() + interval '15 minutes'
      )
      returning id into v_cmd_id;

      v_inserted_count := v_inserted_count + 1;
      v_results := v_results || jsonb_build_object('account_id', v_account_id, 'command_id', v_cmd_id);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'sent', v_inserted_count, 'commands', v_results);
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
    and (c.expires_at is null or c.expires_at > now())
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
      'symbol', coalesce(nullif(v_cmd.payload->>'symbol', ''), v_account.symbol, 'XAUUSD'),
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

revoke execute on function public.ea_next_command(uuid, text) from public;
grant execute on function public.ea_next_command(uuid, text) to anon, authenticated;
revoke execute on function public.create_bulk_command(uuid[], text, jsonb) from public;
grant execute on function public.create_bulk_command(uuid[], text, jsonb) to authenticated;
