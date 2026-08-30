-- pgcrypto is installed in the extensions schema on this project.  The EA
-- RPCs run as SECURITY DEFINER with a pinned search_path, so include that
-- schema explicitly or digest() fails at runtime and PostgREST returns 404.
alter function public.ea_post_state(uuid, text, jsonb)
  set search_path = public, extensions;

alter function public.ea_next_command(uuid, text)
  set search_path = public, extensions;

alter function public.ea_ack_command(uuid, uuid, text, text, text)
  set search_path = public, extensions;

alter function public.publish_master_event(uuid, text, jsonb)
  set search_path = public, extensions;
