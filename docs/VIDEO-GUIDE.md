# Demo video — step-by-step recording guide

Target: **2 minutes 45 seconds**, one take, screen + voice. Devpost and judges skim; a short, clean video beats a long one. Everything below is timed so the whole thing fits.

## 1. Set up (15 minutes, before you press record)

1. **Pull `main`** and start both servers:
   - `npm ci --prefix backend` then `npm start --prefix backend`
   - `npm ci --prefix frontend` then `npm run dev --prefix frontend`
   - Open http://localhost:4000/api/health and confirm `"status":"ok"`.
2. **Dataset.** Use the default 80-person demo (it tells the story most clearly). If you want the "316 people" line on camera, stop the backend, run `npm run seed:enterprise --prefix backend`, start it again — the story still holds.
3. **Browser.** Chrome, window exactly 1440 × 900 (or full-screen on a 16:9 display), light theme, English, zoom 100 %, bookmarks bar hidden (Ctrl+Shift+B), only one tab open, notifications off (Windows: Focus assist / Do not disturb).
4. **Sign in** as `admin@keystone.demo` with "Keep me signed in". Open the overview once so the data is cached and nothing spins during the take.
5. **Reset the state you'll change on camera:** make sure Legacy Billing Recovery has **no owner** (Overview → Details → if it has one, close it) and the Time Machine has **no departures** (Clear scenario).
6. **Recording tool.** Windows: press **Win + Alt + R** (Xbox Game Bar) — records the active window with the microphone. Or OBS Studio (free) with a "Display Capture" source, 1080p, 30 fps. Mac: **Cmd + Shift + 5** → "Record Selected Portion", microphone on.
7. **Microphone.** Headset or phone earbuds beat the laptop mic. Do one 10-second test recording and listen back.
8. **Print or open this script on a phone** so it is not on the recorded screen.

## 2. The shot list (what you click, what you say)

Keep the mouse calm: move, pause, click. Do not scroll fast. If you fumble, pause two seconds and redo the sentence — you can cut it later.

| Time | Screen | Say |
|---|---|---|
| 0:00–0:15 | Overview (already open). Don't move the mouse yet. | "This is Keystone. Every company has a few people the whole thing quietly rests on. Keystone finds them before their resignation email does, puts a number on the risk, and lets you test the fix." |
| 0:15–0:35 | Point at the **One person only** tile, then **Key people: Liam Chen 80/100**. | "Harbor & Pine has forty-four people. Three critical skills rest on one person. The most exposed is Legacy Billing Recovery — one person qualified, two required, criticality five — scored eighty out of a hundred. The score measures dependency, not who is likely to leave." |
| 0:35–0:55 | Open **Details**, set **Coverage = One person**, **Owner = No owner**. Show the chips and the URL. Click **Assign owner** on Legacy Billing Recovery, pick an owner, set the dates, save. | "Filters live in the URL, so I can paste this exact view to a CFO. And a risk isn't real until someone owns it, with a due date and a review date." |
| 0:55–1:10 | **Key people** → expand **Liam Chen**. Point at "If Liam were away: Legacy Billing Recovery 1 → 0" and "Closest backups: Mason Green, level 2". | "If Liam is away, coverage drops to zero. Mason is the closest backup, one level below target. That's our development case." |
| 1:10–1:30 | **Time Machine** → Person: Liam Chen, Month: 3 → **Add departure** → **Compare scenarios**. Point at Legacy Billing Recovery in "Skills that change". | "In the Time Machine I take Liam out in month three. Without any plan, coverage is zero from month three and stays there." |
| 1:30–1:55 | **AI advisor** → Develop a skill: **Legacy Billing Recovery** → **Generate development plan**. Point at the five cards; on **Mentoring**, show Mason (learner) and Liam (mentor), click **Add to Time Machine**. | "The advisor drafts the five levers the brief names — training, mentoring, certification, job rotation, project experience — each tied to a real person and a verified resource, and every one marked 'requires review'. I accept the mentoring plan." |
| 1:55–2:10 | **Time Machine** → **Compare scenarios** again. Point at "With development". | "Same departure, with the mentoring plan: coverage holds. That is the whole product in one line — find the keystone, see what breaks, prove the fix." |
| 2:10–2:35 | **AI advisor** → Plan for future skills. Paste: *Launch a regulated payments product in the EU next year: PCI-grade security, GDPR privacy engineering and cloud automation.* → **Propose future skills** → tick **I reviewed** → **Preview gaps**. | "And the strategy question: where is the business going? Keystone proposes the skills that will be needed, marks which don't exist yet, previews the gap, and nothing enters the plan without approval." |
| 2:35–2:45 | Click **Review queue** (any pending change is fine, or the empty state). | "Every change is proposed by one person and approved by another, and it's all in the audit history. Keystone: find your keystones before they walk out the door." |

Stop recording one second after the last word.

## 3. If something goes wrong during the take

- **A page is slow:** keep talking; the sentence is longer than the load.
- **You mis-click:** say the sentence again from the start; cut the fumble later.
- **The backend dies:** stop, restart it (`npm start --prefix backend`), reload, redo from the last section heading — the video is cut at section boundaries anyway.
- **AI advisor says "Demo mode":** that's fine and honest; say "with no provider key it uses labelled rules — with a key it uses live AI, validated the same way."

## 4. Edit (10 minutes)

- Trim the start and end (Clipchamp on Windows, iMovie on Mac, or YouTube's own trim tool).
- Cut any redo at a section boundary. Don't add music; don't add transitions.
- Optional: a 3-second title card at the start with the name and tagline (black text on light grey), nothing else.
- Export 1080p, MP4.

## 5. Upload

1. YouTube → Create → Upload video → title **"Keystone — hackathon demo"**, visibility **Unlisted**.
2. Description: the one-line pitch and the repo link.
3. Copy the video link into Devpost's **Video demo link** field.
4. Watch it once on your phone with the sound on. If you can hear every word and read every screen, you are done.

## Rehearsal tip

Do the full click path once with the recorder off while reading the script aloud. It takes three minutes and removes 90 % of the retakes.
