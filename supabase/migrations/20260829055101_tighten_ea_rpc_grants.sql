-- EA endpoints are intentionally callable without a user session because MT5
-- terminals cannot hold a Supabase Auth session. They are authenticated by the
-- per-device SHA-256 token; browser users do not need the authenticated grant.
revoke execute on function public.ea_next_command(uuid, text) from authenticated;
revoke execute on function public.ea_ack_command(uuid, uuid, text, text, text) from authenticated;
revoke execute on function public.ea_post_state(uuid, text, jsonb) from authenticated;
revoke execute on function public.publish_master_event(uuid, text, jsonb) from authenticated;
