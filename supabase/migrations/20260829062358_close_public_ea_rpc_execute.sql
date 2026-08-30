-- MT5 cannot use a Supabase Auth session, so these endpoints remain granted
-- to anon and are authenticated inside each function by the device token.
-- Remove PostgreSQL's implicit PUBLIC execute privilege first; otherwise
-- authenticated users inherit access even after a role-specific revoke.
revoke execute on function public.ea_post_state(uuid, text, jsonb) from public;
revoke execute on function public.ea_next_command(uuid, text) from public;
revoke execute on function public.ea_ack_command(uuid, uuid, text, text, text) from public;
revoke execute on function public.publish_master_event(uuid, text, jsonb) from public;

grant execute on function public.ea_post_state(uuid, text, jsonb) to anon;
grant execute on function public.ea_next_command(uuid, text) to anon;
grant execute on function public.ea_ack_command(uuid, uuid, text, text, text) to anon;
grant execute on function public.publish_master_event(uuid, text, jsonb) to anon;
