/* =========================================================
   MULTI-DEVICE PUSH SUBSCRIPTIONS
   ========================================================= */

/*
 * notification_settings remains the user-level preference:
 *
 * push_enabled = whether the user wants push notifications.
 * timezone     = the user's preferred scheduling timezone.
 *
 * Individual browser/device endpoints now live in
 * push_subscriptions.
 */

create table if not exists public.push_subscriptions (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    endpoint text not null,

    subscription jsonb not null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),

    constraint push_subscriptions_endpoint_key
        unique (endpoint),

    constraint push_subscriptions_endpoint_not_blank
        check (length(trim(endpoint)) > 0),

    constraint push_subscriptions_subscription_endpoint_matches
        check (
            subscription ->> 'endpoint' = endpoint
        )
);

create index if not exists push_subscriptions_user_id_idx
    on public.push_subscriptions(user_id);

create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row
execute function set_updated_at();


/* =========================================================
   ROW LEVEL SECURITY
   ========================================================= */

alter table public.push_subscriptions
enable row level security;

drop policy if exists
    "Users can view their own push subscriptions"
on public.push_subscriptions;

create policy
    "Users can view their own push subscriptions"
on public.push_subscriptions
for select
to authenticated
using (
    auth.uid() = user_id
);

drop policy if exists
    "Users can create their own push subscriptions"
on public.push_subscriptions;

create policy
    "Users can create their own push subscriptions"
on public.push_subscriptions
for insert
to authenticated
with check (
    auth.uid() = user_id
);

drop policy if exists
    "Users can update their own push subscriptions"
on public.push_subscriptions;

create policy
    "Users can update their own push subscriptions"
on public.push_subscriptions
for update
to authenticated
using (
    auth.uid() = user_id
)
with check (
    auth.uid() = user_id
);

drop policy if exists
    "Users can delete their own push subscriptions"
on public.push_subscriptions;

create policy
    "Users can delete their own push subscriptions"
on public.push_subscriptions
for delete
to authenticated
using (
    auth.uid() = user_id
);


/* =========================================================
   BACKFILL EXISTING SUBSCRIPTIONS
   ========================================================= */

/*
 * Every existing user currently has zero or one subscription.
 * Copy that subscription into the new endpoint-based table.
 *
 * This migration is safe to rerun because endpoint is unique.
 */

insert into public.push_subscriptions (
    user_id,
    endpoint,
    subscription,
    created_at,
    updated_at,
    last_seen_at
)
select
    deduplicated.user_id,
    deduplicated.endpoint,
    deduplicated.subscription,
    deduplicated.created_at,
    deduplicated.updated_at,
    deduplicated.last_seen_at
from (
    select distinct on (
        push_subscription ->> 'endpoint'
    )
        user_id,
        push_subscription ->> 'endpoint' as endpoint,
        push_subscription as subscription,
        created_at,
        updated_at,
        updated_at as last_seen_at
    from public.notification_settings
    where push_subscription is not null
      and nullif(
            trim(push_subscription ->> 'endpoint'),
            ''
          ) is not null
    order by
        push_subscription ->> 'endpoint',
        updated_at desc,
        created_at desc,
        user_id
) as deduplicated
on conflict (endpoint)
do update set
    user_id = excluded.user_id,
    subscription = excluded.subscription,
    updated_at = excluded.updated_at,
    last_seen_at = excluded.last_seen_at;


/* =========================================================
   PER-ENDPOINT DELIVERY ATTEMPTS
   ========================================================= */

/*
 * notification_log remains one logical notification per user.
 *
 * This child table records what happened when that notification
 * was sent to each endpoint.
 */

create table if not exists public.push_delivery_attempts (
    id uuid primary key default gen_random_uuid(),

    notification_log_id uuid not null
        references public.notification_log(id)
        on delete cascade,

    push_subscription_id uuid
        references public.push_subscriptions(id)
        on delete set null,

    endpoint_hash text,

    status text not null default 'pending'
        check (
            status in (
                'pending',
                'sent',
                'failed',
                'expired'
            )
        ),

    webpush_status_code integer,
    error_message text,

    attempted_at timestamptz not null default now(),
    sent_at timestamptz,
    failed_at timestamptz,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists
    push_delivery_attempts_notification_log_id_idx
on public.push_delivery_attempts(notification_log_id);

create index if not exists
    push_delivery_attempts_push_subscription_id_idx
on public.push_delivery_attempts(push_subscription_id);

create trigger push_delivery_attempts_set_updated_at
before update on public.push_delivery_attempts
for each row
execute function set_updated_at();

alter table public.push_delivery_attempts
enable row level security;

/*
 * No client policies are required yet.
 *
 * The Edge Function uses the service-role key and can therefore
 * write these rows while normal clients cannot inspect delivery
 * diagnostics.
 */