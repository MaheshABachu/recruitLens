-- handle_new_user (from 20260828220000_add_user_scoping.sql) is SECURITY
-- DEFINER and only meant to run via the on_auth_user_created trigger — the
-- Supabase security advisor flagged it as directly callable by
-- anon/authenticated via /rest/v1/rpc/handle_new_user. Trigger invocation
-- runs with the function owner's privileges regardless of these grants, so
-- revoking EXECUTE from public-facing roles doesn't affect it.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
