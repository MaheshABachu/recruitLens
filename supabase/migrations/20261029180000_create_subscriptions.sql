-- Stripe billing: one row per user, mirroring their Stripe customer +
-- subscription. Written only by the stripe-checkout / stripe-webhook Edge
-- Functions (service role, bypasses RLS); the frontend only reads its own row
-- to decide whether to show the paywall.

create table public.subscriptions (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  -- Stripe subscription status: 'trialing' | 'active' | 'past_due' |
  -- 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused'.
  -- null until the first checkout completes.
  status                 text,
  price_id               text,
  trial_end              timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  -- Set once a subscription has ever existed, so a user who cancels and
  -- re-subscribes doesn't get a second free week.
  has_used_trial         boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "subscriptions_select_own" on public.subscriptions
  for select to authenticated using (auth.uid() = user_id);
-- No insert/update/delete policies: clients can't grant themselves a subscription.
