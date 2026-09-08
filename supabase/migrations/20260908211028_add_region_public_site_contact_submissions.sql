create table if not exists public.region_public_site_contact_submissions (
    id uuid primary key default gen_random_uuid(),
    region_id uuid not null references public.regions(id) on delete cascade,
    name text not null,
    email text not null,
    phone text,
    interest_type text not null,
    message text not null,
    status text not null default 'new',
    created_at timestamptz not null default now(),

    constraint region_public_site_contact_name_length
        check (char_length(name) between 1 and 100),

    constraint region_public_site_contact_email_length
        check (char_length(email) between 3 and 254),

    constraint region_public_site_contact_phone_length
        check (phone is null or char_length(phone) <= 40),

    constraint region_public_site_contact_interest_type
        check (
            interest_type in (
                'first_workout',
                'general',
                'other'
            )
        ),

    constraint region_public_site_contact_message_length
        check (char_length(message) between 1 and 2000),

    constraint region_public_site_contact_status
        check (
            status in (
                'new',
                'read',
                'closed'
            )
        )
);

create index if not exists region_public_site_contact_submissions_region_created_idx
    on public.region_public_site_contact_submissions (
        region_id,
        created_at desc
    );

alter table public.region_public_site_contact_submissions
    enable row level security;

revoke all
    on table public.region_public_site_contact_submissions
    from public, anon, authenticated;


create or replace function public.submit_public_region_contact(
    p_region_slug text,
    p_name text,
    p_email text,
    p_phone text,
    p_interest_type text,
    p_message text,
    p_website text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_region_id uuid;
    v_name text;
    v_email text;
    v_phone text;
    v_interest_type text;
    v_message text;
    v_submission_id uuid;
begin
    /*
     * Honeypot.
     *
     * Real visitors never fill this field. Bots commonly do.
     * Return success rather than revealing that the submission
     * was discarded.
     */
    if nullif(trim(coalesce(p_website, '')), '') is not null then
        return jsonb_build_object(
            'success', true
        );
    end if;

    v_name := nullif(trim(coalesce(p_name, '')), '');
    v_email := lower(nullif(trim(coalesce(p_email, '')), ''));
    v_phone := nullif(trim(coalesce(p_phone, '')), '');
    v_interest_type := nullif(trim(coalesce(p_interest_type, '')), '');
    v_message := nullif(trim(coalesce(p_message, '')), '');

    if v_name is null or char_length(v_name) > 100 then
        raise exception 'Please enter your name.';
    end if;

    if
        v_email is null
        or char_length(v_email) > 254
        or v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
    then
        raise exception 'Please enter a valid email address.';
    end if;

    if v_phone is not null and char_length(v_phone) > 40 then
        raise exception 'Phone number is too long.';
    end if;

    if v_interest_type not in (
        'first_workout',
        'general',
        'other'
    ) then
        raise exception 'Please choose a valid reason for contacting us.';
    end if;

    if v_message is null then
        raise exception 'Please enter a message.';
    end if;

    if char_length(v_message) > 2000 then
        raise exception 'Message must be 2000 characters or fewer.';
    end if;

    select r.id
    into v_region_id
    from public.regions r
    join public.region_public_site_config c
        on c.region_id = r.id
    where r.slug = p_region_slug
      and r.environment = 'production'
      and c.is_enabled = true
    limit 1;

    if v_region_id is null then
        raise exception 'Public region site not found.';
    end if;

    insert into public.region_public_site_contact_submissions (
        region_id,
        name,
        email,
        phone,
        interest_type,
        message
    )
    values (
        v_region_id,
        v_name,
        v_email,
        v_phone,
        v_interest_type,
        v_message
    )
    returning id into v_submission_id;

    return jsonb_build_object(
        'success', true,
        'submissionId', v_submission_id
    );
end;
$$;

revoke all
    on function public.submit_public_region_contact(
        text,
        text,
        text,
        text,
        text,
        text,
        text
    )
    from public;

grant execute
    on function public.submit_public_region_contact(
        text,
        text,
        text,
        text,
        text,
        text,
        text
    )
    to anon, authenticated;