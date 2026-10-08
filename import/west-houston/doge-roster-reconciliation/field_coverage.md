# DOGE field coverage

| DOGE field | The Q status | Audit treatment | Product value / recommendation |
|---|---|---|---|
| F3 name | Already modeled as `members.pax_name` | Used for conservative candidate matching | Core identity field. |
| Hospital/real name | Already modeled as `members.real_name` | Candidate enrichment or conflict | Useful for identity disambiguation. |
| Home/original AO | Modeled differently as text `members.home_ao` | Candidate only when semantics are clear | Useful profile context, but text storage limits stable AO linkage. Do not redesign in this audit. |
| FNG/first-post date | Already modeled as `members.first_post_date` and supported by session history | Earlier credible original dates may be candidates; AO-specific dates never overwrite them | Useful for history and FNG reporting. |
| Proud Papa/inviter | Already modeled as canonical `member_inviters` relationships; legacy `members.invited_by_id` mirror | Resolve only to one canonical member; ambiguity stays unresolved | Useful relationship/history field. |
| VQ date | Modeled differently through session Q assignments, not a member date field | Compare as historical evidence only | Existing session history already supports leadership chronology; no new field is justified solely by this workbook. |
| Email | Not on canonical member schema | Retained as source evidence; no proposed mutation | Could help account claiming/contact workflows, but needs a defined privacy and ownership model before schema expansion. |
| Phone | Not on canonical member schema | Retained as source evidence; no proposed mutation | Could help identity verification, but storing it needs a defined operational use and privacy controls. |
| Attendance/post counts and last-post fields | Derived from sessions/statistics | Corroboration only | Existing history should remain authoritative. |
| Address, ZIP, birthday, emergency contact, blood type | Intentionally ignored | Excluded from reconciliation output | No demonstrated product need for this audit and materially higher privacy risk. |
| AO roster location/status | Modeled through member home AO, region participation, and attendance | Context/evidence only | Useful for reviewer context, not direct identity proof. |
