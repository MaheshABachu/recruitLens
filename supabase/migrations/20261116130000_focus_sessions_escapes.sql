-- Fullscreen focus mode for the Vantage Focus extension: whether the session
-- used it, and how many times the user left the problem (other tab, other
-- window, other app, or out of fullscreen) during it.

alter table public.focus_sessions
  add column fullscreen boolean not null default false,
  add column escapes int not null default 0 check (escapes >= 0);

grant insert (fullscreen) on public.focus_sessions to authenticated;
grant update (escapes) on public.focus_sessions to authenticated;
