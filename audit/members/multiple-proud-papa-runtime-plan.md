# Multiple Proud Papa Runtime Plan

Read-only investigation date: 2026-07-13. Runtime code, migrations, schemas, tests, and data were not changed.

## Search Summary

- Runtime source references found in `src/`: 42.
- Core runtime references excluding import/seed/historic compatibility files: 27.
- Broader implementation references including the current Edge import and relevant migrations: 55.
- Existing `member_inviters` migration only creates SELECT RLS; no app-user INSERT/UPDATE/DELETE policy exists for replacing relationships.

## Runtime Reference Classification

| File | Function | Classification | Current scalar assumption | Required array behavior |
|---|---|---|---|---|
| `src/services/cloudData.js` | `loadAllMembers` | member read | Loads only `members.*`, including scalar `invited_by_id`. | Also load `member_inviters` rows for the region, then hydrate each member. |
| `src/services/cloudData.js` | `loadRegionData` | member read/model mapping | Calls `loadAllMembers`, then `mapMemberFromDb`; no relationship join. | Load members and inviter rows together; expose `inviterIds` on every member. |
| `src/services/cloudData.js` | `mapMemberFromDb` | member read/model mapping / legacy compatibility | Maps `row.invited_by_id` to `member.invitedById`. | Return `{ invitedById, inviterIds }`; `inviterIds` is canonical, `invitedById` remains first/fallback scalar. |
| `src/services/cloudData.js` | `insertMember` | member insert | Writes one `invited_by_id`. | Insert member, then call RPC to replace inviter rows with `member.inviterIds`; keep scalar temporarily set to first id or null. |
| `src/services/cloudData.js` | `updateMemberInCloud` | member update | Replaces one `invited_by_id`. | Update member fields, then call RPC to atomically replace `member_inviters`; keep scalar mirror temporarily. |
| `src/services/cloudData.js` | `insertSession`, `updateSessionInCloud`, `deleteSessionFromCloud` | FNG session persistence / stats rebuild targeting | Persists `sessions.fngs` JSON as given; stats rebuild sees one FNG inviter. | Persist FNG `inviterIds` snapshots; after FNG member creation/update, replace member inviter rows; stats targeting includes all old/new inviter ids. |
| `src/services/cloudData.js` | `getAffectedMemberIdsFromSession` | stats rebuild targeting | Adds one `fng.invitedById` or `invited_by_id`. | Add all `fng.inviterIds`, then scalar fallback. |
| `src/services/appData.js` | `ensureFngMembersForSession` | FNG-to-member conversion | Creates member with `invitedById: fng.invitedById`. | Create member with `inviterIds: fng.inviterIds || [fng.invitedById]`; RPC writes relationship rows. |
| `src/services/appData.js` | `addMember`, `updateMember`, `setMemberStatus` | member insert/update | Passes member objects with optional scalar. | Preserve `inviterIds` through state updates; status-only updates should not accidentally clear inviters. |
| `src/components/invitedByField.js` | `createInvitedByField` | member edit UI / FNG UI | Single hidden `.fng-invited-by-select` id. | Replace or extend with multi-select chips returning ordered unique ids; keep scalar class only as fallback if needed. |
| `src/views/sessionView.js` | `addFngRow` | FNG UI | Initializes one invited-by field from `fng.invitedById`. | Initialize multi-select from `fng.inviterIds || [fng.invitedById]`. |
| `src/views/sessionView.js` | `collectFngsFromUi` | FNG session draft / persistence | Stores `{ invitedById }`. | Store `{ inviterIds, invitedById: inviterIds[0] || null }` during transition. |
| `src/views/sessionView.js` | save handler | editing logged session containing FNG | Authorization checks session edit only; relationship replacement is implicit through FNG/member save. | Include all old/new FNG inviter ids in affected stats; if member exists, call member-inviter replacement for that FNG member. |
| `src/views/sessionDetailView.js` | FNG detail rendering | display/rendering | Displays `(Invited by X)` from one `fng.invitedById`. | Render `(Invited by A, B, C)` using `fng.inviterIds` fallback scalar. |
| `src/views/sessionDetailView.js` | Add to Roster click handler | FNG-to-member conversion | Creates new member with one `invitedById`. | Create member with `inviterIds` and scalar fallback. |
| `src/views/memberEditView.js` | `renderMemberEdit` | member edit UI | Shows one `Invited By` field; saves one `invitedById`. | Show multi-select; save `inviterIds`; preserve scalar first id. |
| `src/views/memberDetailView.js` | `renderMemberDetail` | display/rendering | Finds one inviter by `member.invitedById`. | Render all `member.inviterIds` names; fallback to scalar. |
| `src/views/paxCommunity.js` | relationship card | display/rendering / stats-ish relationship graph | Proud Papa is one `member.invitedById`; EH'd PAX are `candidate.invitedById === member.id`. | Proud Papas are all `member.inviterIds`; EH'd PAX are candidates whose `inviterIds` includes member id. |
| `src/modules/backblast.js` | `generateBackblast` FNG text | backblast generation | Renders one FNG inviter. | Render all FNG inviters from `fng.inviterIds` fallback scalar. |
| `src/modules/insights.js` | Q frequency `fngsBrought` | stats calculation | Counts FNGs where `fng.invitedById === qId`. | Count FNGs where `inviterIds` includes q id; decide if multi-inviter counts are relationship credits, not unique FNG totals. |
| `src/modules/members.js` | `addMember` | legacy compatibility | Accepts one `invitedById`. | Accept optional `inviterIds`; keep scalar fallback for local-only legacy paths. |
| `src/views/rosterView.js` | quick add | member insert | Creates member with `invitedById: null`. | Initialize `inviterIds: []` as canonical. |
| `src/data/seedMembers.js` | seed data | legacy compatibility | Seed rows have scalar `invitedById`. | Leave as compatibility or add `inviterIds` in a later cleanup. |
| `src/utils/historicImport.js` | import mapping | legacy compatibility | Copies `matchedMember.invitedById`. | Preserve scalar fallback; do not prioritize in runtime session. |
| `src/services/importAggieland.js` | `importPaxMasterCsv` and repair flows | import/audit-only or legacy admin import | Parses `Proud Papa` as one name and writes scalar. | Defer; audited relationship plan is now source of truth. Do not use for multi-inviter production writes until redesigned. |
| `src/services/importOld300.js` | import flows | import/audit-only or legacy import | Resolves one proud papa and writes scalar into member/session JSON. | Defer unless legacy import is reused. |
| `supabase/functions/nightly-aggieland-import/index.ts` | `syncPaxMaster` | import runtime / Edge import | Creates members with `invited_by_id: null`; ignores Proud Papa. | Keep not writing inviters until it can stage audited relationships or call the same RPC safely. |
| `supabase/migrations/20260712230652_make_member_stats_baseline_aware.sql` | `rebuild_member_stats_for_region`, `rebuild_member_stats_for_member` | stats calculation | Counts `fngs_eh` from scalar FNG JSON only. | Later migration should count from `member_inviters` for member-level relationships or from `fng.inviterIds` for event snapshots. |

## Current Authorization Findings

- Client UI allows member admin/edit via `hasPermission(PERMISSIONS.MANAGE_MEMBERS)` or self-profile edit in `src/views/memberEditView.js`.
- `MANAGE_MEMBERS` is granted to `slt`, `dataq`, and `superadmin` in `src/utils/permissions.js`. `superadmin` has all permissions.
- AO-scoped member management is represented by `canManageAoMembers(aoId)` with AO positions `aoq`, `ao_coq`, and `ao_data_q`, used in `src/views/sessionDetailView.js` for FNG Add to Roster.
- Session create/edit authorization is session-based: `src/views/sessionView.js` permits edit when `MANAGE_SESSIONS`, `canEditAoSession(aoId)`, or creator. `canEditAoSession` maps to AO positions `aoq`, `ao_coq`, `ao_data_q`.
- `public.has_region_access`, `public.my_member_id`, `public.is_region_leader`, `public.manages_ao`, and `public.can_manage_ao_q_slots` exist in migrations and should be reused.
- `member_inviters` SELECT RLS allows users with region access to the invited member region and superadmins. There is no committed write policy for `member_inviters`.
- Committed migrations do not define the base `members` write policies, so do not assume `members_update_same_region` captures actual app authority.

Users/roles that should be authorized to replace `member_inviters`:
- `superadmin`.
- Region leaders for the invited member region: profile role `slt`, plus `profile_region_positions` of `nantan`, `weasel_shaker`, `first_f`, `second_f`, `third_f`.
- Region-level Data Q role (`profiles.role = 'dataq'`) for the invited member region, because UI grants `MANAGE_MEMBERS`.
- AO member managers for the invited member's home/first AO when the member can be scoped to an AO: `aoq`, `ao_coq`, `ao_data_q`.
- The linked member editing his own profile may replace his own inviters, matching current UI behavior. Consider whether this should be restricted; current runtime permits it.
- Session/FNG conversion paths should be allowed when the caller can edit the session AO (`aoq`, `ao_coq`, `ao_data_q`), is region/Data Q/Superadmin, or created the session being edited.

## Recommended Database Write Interface

Use a SECURITY DEFINER RPC, not direct client delete/insert. Direct writes require broad DELETE/INSERT policies and expose partial-failure risk. Folding replacement into existing member insert/update RPCs would be clean long-term, but this repo currently writes `members` directly from several paths; a dedicated RPC is the least disruptive and safest next step.

Recommended RPC shape:

```sql
public.set_member_inviters(
    p_member_id uuid,
    p_inviter_member_ids uuid[],
    p_source text default 'app',
    p_source_metadata jsonb default '{}'::jsonb,
    p_session_id uuid default null
) returns setof public.member_inviters
```

Authorization and validation logic:

```sql
-- Pseudocode for a future migration; do not apply from this document.
select * into target_member from public.members where id = p_member_id;
if target_member.id is null then raise exception 'member not found'; end if;

if not public.has_region_access(target_member.region_id) then
  raise exception 'region access required';
end if;

authorized :=
  public.is_region_leader(target_member.region_id)
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.region_id = target_member.region_id
      and p.role in ('dataq', 'superadmin')
  )
  or public.my_member_id() = p_member_id
  or exists (
    select 1
    from public.aos ao
    where ao.region_id = target_member.region_id
      and ao.name = target_member.home_ao
      and public.can_manage_ao_q_slots(ao.id, ao.region_id)
  )
  or exists (
    select 1
    from public.sessions s
    where p_session_id is not null
      and s.id = p_session_id
      and s.region_id = target_member.region_id
      and (
        public.is_region_leader(s.region_id)
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.region_id = s.region_id and p.role in ('dataq', 'superadmin'))
        or public.can_manage_ao_q_slots(s.ao_id, s.region_id)
        or s.created_by_user_id = auth.uid()
      )
  );
if not authorized then raise exception 'not authorized'; end if;

-- Normalize duplicate ids, reject null/self, validate same invited-member region.
-- Allow inactive inviters; status should not erase historical relationships.
-- Require every inviter member to exist. Prefer same-region inviters initially.
if exists (
  select 1 from unnest(coalesce(p_inviter_member_ids, '{}')) id
  where id is null or id = p_member_id
) then raise exception 'invalid inviter'; end if;

if exists (
  select 1
  from unnest(array(select distinct x from unnest(p_inviter_member_ids) x)) id
  left join public.members inviter on inviter.id = id
  where inviter.id is null
     or inviter.region_id <> target_member.region_id
) then raise exception 'invalid or cross-region inviter'; end if;

delete from public.member_inviters
where member_id = p_member_id;

insert into public.member_inviters(member_id, inviter_member_id, source, source_metadata)
select p_member_id, id, p_source, p_source_metadata
from unnest(array(select distinct x from unnest(coalesce(p_inviter_member_ids, '{}')) x)) id
where id <> p_member_id
on conflict (member_id, inviter_member_id) do update
set source = excluded.source,
    source_metadata = public.member_inviters.source_metadata || excluded.source_metadata;
```

This gives atomic replacement, duplicate removal, FK and self-reference protection, same-region validation, inactive inviter support, source metadata preservation, and one call after member creation or FNG conversion. Use `source='app_member_edit'`, `app_fng_session'`, or `app_fng_conversion'` plus metadata such as session id and raw FNG snapshot.

## Runtime Representation

Use this transitional member shape:

```js
{
    invitedById, // legacy scalar, first inviter id or null
    inviterIds  // canonical ordered unique array for new code
}
```

Do not make `inviters: [...]` canonical yet. IDs are enough for state hydration because `state.members` is already the local member index, and this avoids duplicating stale member objects throughout state.

FNG shape:

```js
{
    invitedById, // legacy first inviter id or null
    inviterIds  // canonical array snapshot for session forms/backblast/history
}
```

On read, normalize every FNG with `inviterIds = unique(fng.inviterIds || fng.invitedByIds || [fng.invitedById || fng.invited_by_id])` and `invitedById = inviterIds[0] || null`.

## Implementation Checklist

1. Add migration with `set_member_inviters` RPC and helper authorization, leaving existing `member_inviters` SELECT RLS intact.
2. Add `loadMemberInviters(regionId)` in `src/services/cloudData.js`; query `member_inviters` for members in the region.
3. Update `loadRegionData` / `loadAllMembers` hydration so each member has `inviterIds`; keep `invitedById` as first id or scalar fallback.
4. Add `setMemberInviters(memberId, inviterIds, metadata)` service wrapper in `cloudData.js`.
5. Update `insertMember` and `updateMemberInCloud` to call the RPC after member writes; avoid clearing inviters on status-only updates by carrying existing `inviterIds`.
6. Replace `createInvitedByField` with a multi-select component that returns `inviterIds`; update `memberEditView` and `sessionView`.
7. Update FNG save/create flows: `sessionView.collectFngsFromUi`, `appData.ensureFngMembersForSession`, and `sessionDetailView` Add to Roster.
8. Update `getAffectedMemberIdsFromSession` and session save/delete rebuild fanout to include all FNG inviter ids.
9. Update displays: `memberDetailView`, `paxCommunity`, `sessionDetailView`, and `backblast.js`.
10. Update `insights.js` to count relationship credits by `inviterIds.includes(qId)`.
11. Retain scalar fallback everywhere during the transition; do not remove or stop writing `members.invited_by_id` yet.
12. Defer scalar cleanup, stats SQL rewrite, Edge importer Proud Papa support, and legacy import rewrites.

## Tests To Run

- Create a new FNG with two Proud Papas, save session, confirm member row exists, `member_inviters` has two rows, scalar has first id, stats rebuild targets FNG plus both inviters.
- Edit that session and remove one Proud Papa, confirm RPC replacement removes only that relationship.
- Add to Roster from session detail for an FNG with multiple inviters.
- Member admin edit: add/remove multiple inviters; verify self-reference rejected.
- Self-profile edit: confirm intended authorization behavior.
- AO Data Q / AOQ / AO COQ session edit for their AO: can replace FNG member inviters.
- Data Q and SLT can edit member inviters region-wide.
- Non-authorized region member cannot edit another member's inviters.
- Backblast, member detail, session detail, and PAX community render multiple names.

## Risks

- Member creation plus relationship replacement is two client calls unless member creation is also moved into an RPC; failure between calls can leave a new member without inviter rows.
- Self-profile editing of inviters is currently allowed by UI but may be too permissive for historical Proud Papa data.
- Mapping AO authority through `members.home_ao` is name-based and weaker than AO id; session-scoped authorization is safer for FNG conversion.
- Stats SQL still counts scalar FNG JSON, so relationship-table truth and `member_stats.fngs_eh` may diverge until a later migration.
- Cross-region inviters are currently rejected in the recommendation for safety; historical DR relationships may need an explicit exception model later.

## Deferred

- Removing `members.invited_by_id`.
- Rewriting stats functions to use `member_inviters`.
- Reworking Aggieland/nightly/import flows to parse and apply Proud Papas.
- Backfilling old `sessions.fngs` JSON to `inviterIds`.
- Introducing full `inviters: [{...}]` embedded member objects.

## Final Recommendation

- Recommended write interface: SECURITY DEFINER RPC `public.set_member_inviters`.
- Authorized users: `superadmin`, region `slt`, region-position leaders, region `dataq`, AO `aoq`/`ao_coq`/`ao_data_q` for session/AO-scoped member work, session creator for that session's FNG conversion, and self-profile editor if current behavior is preserved.
- Highest-risk paths: `src/services/appData.js::ensureFngMembersForSession`, `src/services/cloudData.js::insertMember/updateMemberInCloud/getAffectedMemberIdsFromSession`, `src/views/sessionView.js::collectFngsFromUi`, and `src/views/memberEditView.js::renderMemberEdit`.
- First code file to modify after the database write interface exists: `src/services/cloudData.js`, because it owns loading, member mapping, member writes, session persistence, and stats affected-member fanout.
