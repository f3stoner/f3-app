/*
 * Link manual quantity campaigns to the canonical activity catalog.
 *
 * This is the bridge that will eventually allow one activity entry
 * to count toward every compatible challenge/campaign.
 */


/* =========================================================
   CAMPAIGN ACTIVITY RELATIONSHIP
   ========================================================= */

alter table public.campaigns
add column if not exists activity_type_id uuid
references public.activity_types(id);


/*
 * Manual quantity campaigns will frequently be queried by
 * canonical activity when reconciling logged activity.
 */
create index if not exists campaigns_activity_type_idx
on public.campaigns (
    activity_type_id,
    starts_on,
    ends_on
)
where activity_type_id is not null;


/* =========================================================
   BACKFILL EXISTING MANUAL CAMPAIGNS
   ========================================================= */

/*
 * Existing campaigns currently store their human-readable
 * activity in metric_config.
 *
 * Backfill only when the value maps cleanly to a canonical
 * activity type.
 */
update public.campaigns campaign
set activity_type_id = activity.id
from public.activity_types activity
where campaign.metric_key = 'manual_quantity'
  and campaign.activity_type_id is null
  and lower(
        trim(
            coalesce(
                campaign.metric_config ->> 'activityName',
                campaign.metric_config ->> 'unit',
                ''
            )
        )
      ) = lower(activity.display_name);


/*
 * Handle a few expected spelling/format variations explicitly.
 */
update public.campaigns campaign
set activity_type_id = activity.id
from public.activity_types activity
where campaign.metric_key = 'manual_quantity'
  and campaign.activity_type_id is null
  and activity.activity_key = 'merkins'
  and lower(
        trim(
            coalesce(
                campaign.metric_config ->> 'activityName',
                campaign.metric_config ->> 'unit',
                ''
            )
        )
      ) in (
        'merkin',
        'merkins'
      );

update public.campaigns campaign
set activity_type_id = activity.id
from public.activity_types activity
where campaign.metric_key = 'manual_quantity'
  and campaign.activity_type_id is null
  and activity.activity_key = 'miles'
  and lower(
        trim(
            coalesce(
                campaign.metric_config ->> 'activityName',
                campaign.metric_config ->> 'unit',
                ''
            )
        )
      ) in (
        'mile',
        'miles'
      );


/* =========================================================
   SHAPE PROTECTION
   ========================================================= */

/*
 * Automatic metrics do not currently consume member activity
 * entries, so activity_type_id is only meaningful for
 * manual_quantity campaigns.
 */
alter table public.campaigns
drop constraint if exists campaigns_activity_type_shape;

alter table public.campaigns
add constraint campaigns_activity_type_shape
check (
    activity_type_id is null
    or metric_key = 'manual_quantity'
);