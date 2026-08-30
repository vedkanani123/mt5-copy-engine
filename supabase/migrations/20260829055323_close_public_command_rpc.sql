-- Revoke PostgreSQL's default PUBLIC execute privilege explicitly.
revoke execute on function public.create_bulk_command(uuid[], text, jsonb) from public;
grant execute on function public.create_bulk_command(uuid[], text, jsonb) to authenticated;
