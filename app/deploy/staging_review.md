# Final staging review (Phase 8C)

Written 16 November 2026. **The application is running locally at http://127.0.0.1:8080, private to this Mac. The private phone test has not happened yet, because Tailscale is not running and not signed in, and starting it changes network access, which needs your decision (section 1).** Nothing was committed, pushed, deployed or paid for. No account was created. No cloud resource exists.

## 1. Private mobile access: where it stands and what I need from you
**Checked, read only:** Tailscale is **not running and not authenticated** on this MacBook Pro. There is no Tailscale app, no daemon, no state and no login. Only the command line client (1.104.7, installed in Phase 8B) is present. This Mac's names are neutral ("MacBook Pro", "MacBook-Pro"), so they do not contain your name.

**What starting it would do, and why I stopped.** Signing this Mac into your existing Tailscale account adds it to the **same tailnet as another server of yours**. That has consequences you should decide on:
1. **Tailscale's default policy lets every device in a tailnet reach every other device** (Tailscale docs, search summary). Unless your policy file already restricts it, the other server could reach this Mac, and this Mac could reach the other server. I do not know your current policy. Open the admin console, Access controls, and read it before agreeing.
2. **Userspace mode may forward inbound tailnet connections to this Mac's local ports** (I believe so, but could not confirm from the documentation I found). If so, every local service, including Docker's port 8080, would be reachable by any permitted tailnet device, not only the one Serve address. A restrictive policy is the protection.
3. **HTTPS certificates are public.** Tailscale's documentation says certificates are recorded in the public Certificate Transparency log, which includes the **machine name and the tailnet name**, and that disabling HTTPS later does **not** revoke a certificate. The tailnet name is randomised to hide who owns it, but the machine name stays visible. I would use a neutral machine name and, for this test, **plain HTTP over the tailnet**, which is still encrypted between your devices and creates no certificate.
4. **Free plan:** Tailscale's Personal plan is described as free for non commercial use with up to six users (search summary of Tailscale's pricing page; I could not open the live page). Your existing account's plan is already decided by your existing setup; I add no paid feature and I will stop if any page asks for payment.
5. **Funnel (public internet) will not be enabled.** I will run only `tailscale serve`, check `tailscale serve status` and `tailscale funnel status`, and show you both.

**Permissions I would need, in order. Nothing has been done.**
| # | Action | What it needs from you | Changes |
|---|---|---|---|
| 1 | Start the Tailscale background process without administrator rights (`tailscaled --tun=userspace-networking`, state in `~/.tailscale`) | nothing; or, instead, `sudo brew services start tailscale` if you prefer the system service (needs your password and adds a system service) | a process on this Mac that can connect outward, once signed in |
| 2 | `tailscale up --hostname=pi-staging` | **you sign in in a browser** with your existing account and approve the device | joins this Mac to your existing tailnet |
| 3 | Admin console review | **you** read the access policy, and decide whether to restrict it so only your iPhone can reach this Mac and the other server cannot | possibly your policy file (I will not edit it) |
| 4 | `tailscale serve --bg --http=80 8080` (HTTP, no certificate) | nothing more | makes the container reachable at `http://pi-staging` for tailnet devices that policy allows |
| 5 | Open that address on your iPhone, which is already on the tailnet | you | nothing |
| 6 | Afterwards `tailscale serve reset`, `tailscale down`, stop the process | nothing | removes access |

**A safer alternative if you would rather not join your existing tailnet:** serve the container to your iPhone over your home Wi-Fi only, for a session, by publishing it on this Mac's local network address instead of loopback. That exposes it to everyone on that network (the macOS firewall is currently off, see section 5), without any tailnet, account or certificate, and is undone by restarting the container with the loopback setting. This is also a change in network access, so it also needs your yes.

**Tell me which you choose:** (A) Tailscale with your existing account, HTTP only, after you have read the policy; (B) Tailscale with HTTPS and a neutral machine name, accepting the public certificate entry; (C) home Wi-Fi only; (D) skip phone testing for now. Until then I have done what could be done without it: emulated an iPhone 15 and a Pixel 7 against the container (section 3).

## 2. Functionality
| Area | Result |
|---|---|
| Application | single container, public mode, one worker, started in 3.7 s, healthy, 22 of 22 smoke checks and 17 of 17 configuration checks inside the container |
| Frontend | served by the container; deep links work; browser suites pass on the container: **454 passed, 10 skipped** over four profiles (Chrome, WebKit, iPhone 15, Pixel 7), plus 101 (Chrome, dev server), 125 (Chrome, production build with the content security policy) and 13 (classifier, local mode) |
| Search | both methods return separate lists with their own scores; the browser suites compare the displayed scores with the API's per method; 34 searches in a row hit the rate limit exactly at the 31st (429, `Retry-After: 60`) while reads and health stayed available |
| Charts and dialogs | table views, readouts, filters, the profile dialog and the comparison dialog all exercised in every browser profile |
| Lab findings | served from the verified aggregate file; macro F1 0.386 checked by the smoke test |
| Unit tests | 155 frontend, 329 backend (1 skipped) |

## 3. Accessibility and responsive behaviour
| Check | Result |
|---|---|
| axe, WCAG 2.2 A and AA, Chrome | 0 violations on every page, light and dark, desktop and phone, tables open, dialogs open |
| axe in **Firefox** (Linux, new this phase) | **76 checks, 0 violations, 0 crashes**: all 9 pages, light and dark, desktop and phone, chart tables open, and Discovery with results, the profile dialog, the comparison tray and the comparison dialog |
| Keyboard, focus visible and not obscured, target size, reflow at 320 px, text spacing, reduced motion, 200% zoom | pass in Chrome and WebKit; Firefox keyboard check passes (one run in eleven failed with a browser crash, 3 of 3 passed when repeated) |
| iPhone 15 (WebKit) and Pixel 7 (Chrome) device profiles | 111 passed, 4 skipped and 114 passed, 1 skipped, then the one failure (see problems) was fixed and re-run green |
| **Not done by me:** a real VoiceOver review | VoiceOver cannot be driven from here. I added a 15 minute guided pass at the top of `voiceover_checklist.md`. **This is for you to run** (section 6) |
| **Not done:** a real iPhone | pending the decision in section 1 |

## 4. Firefox
Firefox could not start on this Mac. In a **Linux container** (free, Microsoft's public Playwright image) it runs: **108 passed, 1 skipped, 7 failed** in Playwright's test runner. The 7 failures are all "Page crashed" inside the axe step on the classifier page and the Discovery results page, and they change from run to run (30 to 70 percent of those tests, in a one by one bisect). I traced the trigger to Playwright's Firefox automation (an `.or()` locator, and similar polling, followed by an axe run), not to the application: the same pages pass axe in Firefox 76 of 76 times when run directly, and the 3 pages that failed in the test runner all pass there. Because the test runner cannot give a stable Firefox axe result, `frontend/tools/browser-axe.mjs` does, and `deploy/run_firefox_linux.sh` runs both.

## 5. Privacy and security
| Check | Result |
|---|---|
| Container | non root (user 1000), read only file system, all capabilities dropped, no new privileges, 1 GB memory with no swap, 256 processes, published on **127.0.0.1 only**; the LAN address refuses connections to port 8080 |
| Docker daemon | reached only through a user owned unix socket (`~/.colima/default/docker.sock`, mode 600); no TCP endpoint; one published port |
| Image contents (45,713 files) | no match, by content hash, with the real data file or any Tier 1 file; no forbidden names, credentials or local paths; all 71 application files equal the bundle; the image text has no prose match with the 441,351 real essays (only the fixed answer label) |
| Logs and storage | request log lines only (route template, status, time, size); none of the test text; the browser holds only the theme choice |
| Tailscale | not running, no account, no daemon, no Funnel |
| **Finding: Colima's engine listens on TCP port 53 on all network interfaces** | `limactl` (Lima, the engine under Colima) is the VM's DNS resolver. It accepts a connection on the LAN address and then resets it, and gives no answer to UDP queries, so it is not an open resolver. But it is a listening port on every interface, and **the macOS application firewall is off** on this Mac. Nothing of ours is reachable through it. **Mitigations, all yours to choose:** stop Colima when you are not testing (`colima stop`), or switch on the macOS firewall (System Settings > Network > Firewall). I changed nothing |
| Other listeners | Apple's AirPlay Receiver (ports 5000 and 7000) and `rapportd` also listen on all interfaces. They belong to macOS, not to this project |

## 6. Performance (container, two CPU virtual machine)
Cold start 3.7 s (three identical runs); memory about 392 MiB idle and 447 MiB after 450 browser tests, peak resident 588 MB, no kill; reads 1.4 to 2.1 ms median; search with both methods 24.7 ms median (27 ms at p99), embeddings 20.4 ms, TF-IDF 3.2 ms, a 2,000 character search 59 ms. About twice the native times because of the virtual machine. Web vitals on the production build (Phase 7): phone LCP 1.4 to 1.9 s, layout shift at most 0.07.

## 7. Problems found this phase and their fixes
| # | Problem | Fix |
|---|---|---|
| 1 | Test helper returned a `FontFaceSet` from `page.evaluate`, which can crash Firefox's automation | helper now returns nothing |
| 2 | Test helper used an `.or()` locator before axe, crashing Firefox about half the time | replaced with a plain selector wait |
| 3 | The keyboard test started tabbing from a click at the top left, which starts at a different element in each browser, so the About page counted one stop in Firefox | the test now starts from the top of the document in every engine (Chrome still passes) |
| 4 | The "theme persists" test assumed the theme buttons are in the top bar; on a phone they are in the navigation drawer | the test opens the drawer on narrow screens (passes on desktop, iPhone 15 and Pixel 7) |
| 5 | Firefox test runner crashes in axe (above) | a standalone Firefox axe runner with crash retry, and a script that runs everything on Linux |
| 6 | Colima engine listens on port 53 on all interfaces (above) | reported, not changed |
| 7 | (Phase 8B, kept for the record) root only cache file in the image; no `git` in the image broke the config check | fixed in 8B |
No application code changed in this phase. All fixes are in tests, tools and documents.

## 8. Remaining blockers before any public launch
1. **A real VoiceOver pass** on Mac and iPhone (guided script in `voiceover_checklist.md`), and a real iPhone test, which need your decision in section 1.
2. **A platform rehearsal:** this is a laptop. Proxy depth, a real cold start and platform logs are untested.
3. **Public hosting is undecided** (Fly.io, Cloud Run, or a Hugging Face PRO Space at $9 a month), with the account, billing and approval steps that come with it.
4. **Header scan on the real public address** over https, and HSTS confirmed in a browser.
5. **Uptime and log monitoring** set up on the chosen host; check what the platform itself logs about visitors.
6. **Rate limits across more than one instance**, if you ever run more than one.
7. **Supply chain:** versions are pinned but not hashed; re-run `pip-audit` and `npm audit` before release.
8. **Licences and publication:** the repository is still private; publishing it, and the source data's terms, are a separate decision.
9. **This Mac's network exposure** while Colima runs (section 5): decide on the firewall.

## 11. Update: private phone test and the independent review corrections (16 November 2026)
**Phone test.** Option A was carried out: this Mac joined your existing tailnet as `pi-staging` (CLI client, userspace mode), Serve exposed the app on HTTP port 80, tailnet only, with no Funnel and no certificate. The HTTP form of Serve did not work in userspace mode (Tailscale logged "packet was not handled"), so a plain TCP forward to the container was used instead, and your iPhone then loaded the app. The container log showed the requests arriving (route, status, time and size only). **The Mac is now off the tailnet: Serve is removed and the client is stopped.** The access policy was not changed and is still allow all (the policy review and draft are kept outside Git because they hold device details). Tailscale also asks the home router for a port mapping by default (UPnP or NAT PMP). That only concerns Tailscale's own tunnel port.

**Part A corrections** (frontend only; the notebook, research numbers, models, synthetic data and privacy boundaries are unchanged):
| # | Change | Where |
|---|---|---|
| 1 | Home page no longer says no profiles exist. The illustration caption and the "early build, Placeholder" line are replaced with accurate wording, and a prominent **Try Profile Discovery** button (44 px high) sits under the introduction | `pages/Home.tsx` |
| 2 | The page is called **Classification evidence** in the menu, heading, page title and tab title in public mode, and while the mode is still unknown. **Classification demo** appears in local mode only. In public mode the section title is "Live demonstration" instead of "Try the classifier on a fictional example" | `lib/nav.ts`, `SidebarNav.tsx`, `AppShell.tsx`, `pages/Classify.tsx` |
| 3 | The chart title now reads "Adding segments did not improve validation macro F1." The average change of −0.0017 stays in the source line and the table | `pages/Models.tsx` |

**Tests for the corrections:** 4 new unit tests (home wording and link, the segment sentence without "noise", the public name in the menu, heading and tab title, and the local name), 2 new browser tests on every public profile, and 1 new local mode test.

**Results after the corrections:**
| Suite | Result |
|---|---|
| Frontend type check, lint, production build | pass |
| Frontend unit tests | **159 passed** (was 155) |
| Backend | **336 passed**, 1 skipped (was 329, plus 7 policy tests); ruff check and format clean |
| Chrome, development server | **101 passed**, 1 skipped, plus the 2 new tests passing |
| Chrome, production build with the content security policy | **127 passed**, 1 skipped |
| Local mode with the real classifier | **14 passed** |
| New image `staging-20261116-4`: image scan | 0 findings, 4 private hashes checked, 71 of 71 application files match the bundle |
| New image: smoke test | **22 of 22** |
| New image: Chrome, WebKit, iPhone 15, Pixel 7 | **462 passed**, 10 skipped (460 first run, then the 2 failures, a wrong button name in my new phone test, were fixed and re run green) |
| Firefox on Linux, standalone axe runner | **76 checks, 0 violations**, 0 crashes |
| Firefox on Linux, Playwright runner | 109 passed, 1 skipped, **8 failed**, all "Page crashed" inside axe (the known Firefox automation fault, now 8 instead of 7). None of the new tests failed |

**Accessibility and responsive checks:** axe finds no WCAG A or AA problems on the home page, Discovery and the Classification evidence page in light and dark, on desktop and phone, in Chrome, WebKit and Firefox. Reflow at 320 px, text spacing, reduced motion and 200 percent zoom pass in Chrome, and the iPhone 15 and Pixel 7 profiles pass the layout, dialog and menu tests. The real VoiceOver pass remains yours to do.
