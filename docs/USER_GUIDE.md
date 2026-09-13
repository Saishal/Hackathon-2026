# Keystone user guide

## Start at Home

After signing in, Home greets you by display name and offers large, role-appropriate navigation cards. Workforce readers can open Workforce overview, Skill map, Key people and their permitted planning/governance tools. Employees see My profile, My development plan and Help center. Development opens the suggestions section of the existing personal profile.

Compact signals link to the detailed Overview or Data quality. They are recorded coverage counts, not predictions about people leaving. **Open detailed overview** brings back the full operational dashboard, including its existing filters and expandable sections. The sidebar remains available on every page.

## Skill Map

Choose **Network**, **Matrix**, **Heat map** or **Charts**. Existing charts and their controls are preserved. Search matches skill names and categories without case sensitivity. Select one department or all visible departments, minimum proficiency (1–5), and optionally **Only at-risk skills**. That last filter uses the existing organization-wide Bus Factor of zero or one; it is not recalculated from your department. **Reset view** clears search and restores display/filter defaults. Search text stays only in memory; existing display preferences remain per person in the browser.

Matrix retains lower-level evidence as faded context. A CSV includes only evidence at or above the selected minimum. Missing records are unknown, not proof of missing ability.

### Heat map

Rows are skills and columns are departments visible to your role. Each cell contains recorded qualified holders / the **organization-wide** required-holder target. Departments do not yet have their own persisted targets: their cells show contributions against the organization reference, not departmental compliance. Managers only see their team members’ contributions.

Qualification uses the higher of the selected minimum proficiency and the skill’s target proficiency. Official dependency scoring is unchanged and counts recorded evidence; verification is reported separately. Cell labels and the legend accompany colors:

| State | Meaning |
|---|---|
| Critical | Zero recorded qualifying holders where verified evidence is available. |
| At risk | One holder, even if the target is one; or multiple holders below 80% of the target. |
| Watch | Two or more holders, at least 80% but below the target. |
| Healthy | Two or more holders meeting or exceeding the target. |
| Unknown | Missing/invalid target, no verified evidence, or any qualifying record lacking verification. |

Sort by dependency score, name, criticality or gap size. Dependency is the established organization score; gap is calculated from the visible holder count against the organization target. Select a cell to narrow to that department and see filtered evidence. Use keyboard Tab/Enter on cell buttons. At narrow widths the table scrolls horizontally and retains skill labels.

### Download CSV

Apply filters and choose **Download CSV**. Downloads come from the server, enforce your access, and record an export event in audit history. Admins and HR can export the organization; managers can export their visible team. Employees cannot export the workforce map. No rows means a clear message and a disabled button; a stale empty result from the server also produces a message.

Fields are `employee_id`, `employee_name`, `role`, `department`, `skill_id`, `skill_name`, `skill_category`, `proficiency`, `verified`, `evidence_source`, `last_verified_at`, `skill_criticality`, `required_holders`, `qualified_holders`, `dependency_score`, `risk_level`, `coverage_scope`, `target_scope`, and `dependency_score_scope`.

One row is one visible employee–skill evidence record. Qualified holders are aggregated across the current filtered scope at the higher of the selected minimum and skill target. Required holders and dependency score retain organization scope. Export risk level describes aggregate filtered coverage, while heat-map cells describe each department; they can differ when several departments are selected. Blank verification dates stay blank. Spreadsheet formula prefixes are escaped as text.

In Excel, use **Data → From Text/CSV** with UTF-8 and comma delimiter. In Power BI or Tableau use the Text/CSV connector. Treat identifiers as IDs, proficiency/counts/scores as numbers, `verified` as boolean and verification dates as nullable dates. Do not sum repeated skill-level counts across employee rows: group by skill and scope and use one value (for example MAX) for `required_holders`, `qualified_holders` and `dependency_score`.

## Search help and ask the assistant

**How Keystone works** searches titles, descriptions, keywords, FAQ text, the existing glossary/tasks and allowed page descriptions as you type. Searches are case-insensitive and all search words must match a topic. The count identifies matching topics; no results offers **Clear search**. Topic links use `#/help?topic=...` and open the exact section. Restricted pages have no actionable page link.

The top-bar **Keystone Assistant** opens an accessible dialog with a close button, Escape support and focus restoration. It explains basics and provides shortcuts for users/roles/permissions, maps/matrix/heat maps, risks/gaps, dependency/Bus Factor, CSV reports, people/evidence/profile and help. Try any of the six quick prompts. An employee asking about users receives a restriction explanation and a Help Center link.

Unsupported questions, specific people questions and workforce decisions receive: “I can help you find Keystone features and explain the guide. For that question, please search the Help Center or review the relevant guide.” It offers **Open Help Center** and **Search Help Center**, which focuses the search box. Questions live only in component memory and disappear when the assistant closes. They are not logged, saved or sent to an external model. This assistant is separate from the existing AI advisor, which retains its configured server-side provider and review process.

## Sign-in, sign-out and preferences

**Keep me signed in** is selected by default in demo. It keeps a secure HTTP-only session cookie on the device so a valid session can restore without showing the sign-in form. The default limits are 8 hours idle and 24 hours absolute; administrators may configure them. This is not permanent login. Revoked, disabled, idle-expired or absolute-expired sessions cannot restore.

Unselected uses a browser-session cookie and an 8-hour maximum by default, capped by the absolute limit. Some browser session-restore settings can retain session cookies, so always **Sign out** on shared devices. Successful sign-out revokes the session and clears the cookie. If offline, retry: the app does not claim the server session was cleared. Invalid saved cookies show a helpful sign-in notice when the server can detect them. If a cookie has already disappeared, the normal sign-in form is shown.

The password field warns **Caps Lock is on.** when keyboard modifier information is available. Turning it off or leaving the field hides the warning. It never reveals password text; browser automation and some keyboards may not report Caps Lock.

The preferences control remains available before and after sign-in. Home, sign-in additions, heat-map labels and assistant controls support English and Spanish and use the existing light/dark/system theme. The long-form Help Center and curated assistant answers remain English. Notifications and global search remain in the top bar.

On wider screens, the button beside the Keystone logo collapses the sidebar to icons so pages have more room; hover an icon to see the page name, and press the button again to expand. Keystone remembers the choice in this browser.
