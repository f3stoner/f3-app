alter table notification_log
add column if not exists idempotency_key text,
add column if not exists status text not null default 'sent',
add column if not exists payload jsonb not null default '{}'::jsonb,
add column if not exists attempt_count integer not null default 0,
add column if not exists webpush_status_code integer,
add column if not exists error_message text,
add column if not exists sent_at timestamptz,
add column if not exists failed_at timestamptz,
add column if not exists updated_at timestamptz not null default now();

update notification_log
set idempotency_key =
    case
        when notification_type = 'weekly_q_summary' then
            concat(
                notification_type,
                ':',
                user_id,
                ':',
                coalesce(
                    metadata->>'key',
                    concat('weekly_', metadata->>'date_key'),
                    concat('legacy_', id::text)
                )
            )

        else
            concat(
                notification_type,
                ':',
                user_id,
                ':',
                coalesce(
                    q_slot_id::text,
                    metadata->>'key',
                    concat('legacy_', id::text)
                )
            )
    end
where idempotency_key is null;

alter table notification_log
alter column idempotency_key set not null;

create unique index if not exists notification_log_idempotency_key_uidx
on notification_log (idempotency_key);