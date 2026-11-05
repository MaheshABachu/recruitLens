-- Reliable 30-minute job sync.
--
-- GitHub's own `schedule` trigger for .github/workflows/sync-jobs.yml is
-- best-effort and in practice fired every 4-8 hours. pg_cron here calls
-- GitHub's workflow_dispatch API every 30 minutes instead (the workflow keeps
-- its schedule as a fallback; its concurrency group stops overlapping runs).
--
-- Needs a GitHub fine-grained token with "Actions: Read and write" on
-- MaheshABachu/recruitLens, stored in Vault:
--   select vault.create_secret('<token>', 'github_sync_dispatch_token');
-- Until that secret exists the cron job is a no-op.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.dispatch_job_sync()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
begin
  select decrypted_secret into token
  from vault.decrypted_secrets
  where name = 'github_sync_dispatch_token';
  if token is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://api.github.com/repos/MaheshABachu/recruitLens/actions/workflows/sync-jobs.yml/dispatches',
    body := '{"ref":"master"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'vantage-sync-cron',
      'Content-Type', 'application/json'
    )
  );
end;
$$;

revoke execute on function private.dispatch_job_sync() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'dispatch-job-sync';
select cron.schedule('dispatch-job-sync', '*/30 * * * *', 'select private.dispatch_job_sync()');
