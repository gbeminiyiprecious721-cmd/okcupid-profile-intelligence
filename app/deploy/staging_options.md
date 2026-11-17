# Revised staging recommendation (supersedes the Hugging Face advice in the other deploy documents)

Written 16 November 2026, after reading Hugging Face's own documentation. Nothing was bought, created, pushed or deployed. Every statement is marked **Verified** (read in an official page this session), **Search only** (a search summary of an official page, not read directly) or **Unverified** (my belief; check before relying on it).

## 1. The correction
My earlier advice said a private Hugging Face Docker Space was free. **That was wrong.**
- **Verified** (Hugging Face Spaces overview): "Gradio and Docker Spaces run on compute and require a paid plan to create: PRO for personal accounts, Team or Enterprise for organizations."
- **Verified** (hardware page): "CPU Basic has no hourly cost, but creating a new Space that runs on compute (Gradio or Docker) requires a paid plan."
- **Verified:** free personal accounts can still host Static Spaces (free for everyone) and up to 2 Gradio Spaces on ZeroGPU. Neither can run our FastAPI container.
- **Search only:** PRO is listed at $9 a month on Hugging Face's subscribe page. Team is $20 per user a month.
- **Not stated** on any page read: a payment method on file or a verified account as separate conditions.

## 2. Is your Hugging Face account eligible?
**I could not check, and I did not try to log in.** This computer has no Hugging Face token (no stored token file, no token environment variable) and the `hf` command is not installed outside the project's environment. I will not ask for your credentials. What the documentation says decides it:
| Your account | Can create a Docker Space? |
|---|---|
| Free personal account | **No** (needs PRO) |
| Personal account with an active PRO subscription | **Yes** |
| A Team or Enterprise organization you own or can create Spaces in | **Yes**, in that organization |
**To check in two minutes, with no purchase:** sign in at huggingface.co and open Settings, then Billing (or Subscription). It shows the plan. If it says PRO, or if you belong to a Team or Enterprise organization, you are eligible. If it says Free, you are not. Do not click Subscribe.
If you are eligible, Hugging Face remains a sound staging host, with the changes in section 4. If not, section 3 compares what needs no payment.

## 3. Options that need no immediate payment
| Option | Private | Fits 2 GB container | What you pay | Account and card | Tests the real host? | Verdict |
|---|---|---|---|---|---|---|
| **A. Run the container on this Mac, shared privately with Tailscale** | Yes: reachable only by your own devices | Yes (needs about 1 GB) | $0 | Docker runtime installed locally (free); a Tailscale account, free for non commercial use, no card. **Search only:** Personal plan is free, six users, unlimited devices | No: it does not test a platform's proxy, cold start or logs | **Recommended first** |
| **B. Google Cloud Run, private service** | Yes: `--no-allow-unauthenticated`, reached through an authenticated local proxy | Yes (2 GiB) | $0 expected inside the free allowance | A Google Cloud billing account, which I believe needs a card (**Unverified**); nothing is charged unless you exceed the free allowance, so set a budget alert and `max-instances=1` | Yes: real platform, real proxy, real cold start | **Recommended second, if you accept a card on file** |
| **C. Fly.io private app (no public address)** | Yes: **Search only:** no public IP, reached through WireGuard or `fly proxy` | Yes (1 to 2 GB) | pay as you go, about $6.70 a month for 1 GB always on, cents if stopped when idle | **Search only:** the Fly homepage says "No credit card to start". Whether that holds for deploying a machine is unconfirmed | Yes | Possible. More networking work than B |
| **D. Oracle Cloud Always Free VM** | Yes, but you secure the server yourself | Yes: **Search only:** 2 OCPU and 12 GB of ARM, down from older 4 OCPU and 24 GB figures | $0 | **Search only:** card and phone number required, not charged unless you upgrade; idle instances can be reclaimed | Partly: it is a plain server, not a container platform | Not recommended: you run and patch a server, and capacity and policy have changed |
| **E. Hugging Face Static Space** | Free | No: static files only, no Python | $0 | free account | No | Ruled out |
| **F. Hugging Face PRO, one month** | Yes (section 4) | Yes | $9 for the month, **Search only**; I did not verify how cancelling works | PRO subscription | Yes | Only if you want the original plan and approve the purchase |

### Recommendation
1. **Stage 1, now: option A.** It costs nothing, needs no card, keeps the application single container, and closes the biggest open blocker: the Dockerfile has never been built. You get to run the exact image, test it as read only and non root with a 1 GB memory limit, and test with VoiceOver on your Mac and iPhone over private HTTPS.
2. **Stage 2, only if you want a real host rehearsal: option B** (Cloud Run, private). It tests what A cannot: a platform's proxy depth, a real cold start and its logs. It needs a Google billing account, so it is your decision. Option F (Hugging Face PRO) is the alternative if you prefer that host.
3. **Public hosting stays a later decision** (Fly.io or Cloud Run), as before.
The architecture is unchanged in every option: one image, API and web application on one origin, built from the allowlisted bundle, public mode only.

## 4. If you choose Hugging Face (eligible account or PRO)
Verified facts that change the plan:
- **Private Spaces have no public address.** **Verified:** "Private Spaces are fully private: the source code and the running app are only accessible to the owner and collaborators", other users get a 404, and the visibility table says the app is **not** accessible via the embed URL or a custom domain. So my earlier plan to "open the direct address" was wrong for a private Space. The app is viewed on the Space's page on huggingface.co, which shows it in a frame, and our policy (`frame-ancestors 'none'`, `X-Frame-Options: DENY`) **blocks being framed**. For a Hugging Face staging only, framing from `https://huggingface.co` would have to be allowed, as a setting that exists only in that deployment. That setting is not built yet.
- **Not stated:** whether a token lets a script call a private Space (my smoke test assumed it). Treat the outside smoke test as **uncertain** on a private Space until tried.
- **Protected visibility** (public app, private code) is a PRO feature, and makes the app publicly reachable. Not suitable for staging.
- **Verified:** the container runs as user id 1000. The Dockerfile now uses 1000 (it was 10001).
- **Verified:** default port 7860 (`app_port` changes it); outbound requests are limited to ports 80, 443 and 8080; disk is 50 GB and not persistent; variables are injected at run time; secrets are available at run time and, by mounting, at build time.
- **Verified:** CPU Basic hardware is 2 vCPU and 16 GB. On `cpu-basic` a Space sleeps after inactivity (currently 48 hours) and wakes on a visit; upgraded hardware does not sleep by default.
- **Not stated** on the pages read: image size limit, build time limit, build disk, whether the build has network access (it must, to download the model), a Spaces number limit per plan, and the command to create a Space with the `hf` CLI.
- **Verified:** each push to the Space repository rebuilds and restarts it. A write token (or a fine grained token with write access to that Space) is needed to push; whether a git remote for Spaces uses `https://huggingface.co/spaces/OWNER/NAME` is **Unverified** (the pages read give the model and dataset forms only).

## 5. Exact commands and permissions, per option
**Nothing below has been run.** Items marked **[approval]** change this computer or create something outside it.

### Option A: local container + Tailscale (recommended first)
Permissions and approvals:
- **[approval] Install a container runtime.** Docker is not installed. Free choices on a Mac: Colima with the Docker command line (open source; installed with Homebrew), or Docker Desktop (free for personal use under Docker's terms, **Unverified**). Needs your admin password for some installers.
- **[approval] Create a Tailscale account and install Tailscale** (sign in with an existing identity provider; the Personal plan is free for non commercial use, **Search only**). It adds a VPN network adapter. No card.
- No cloud resource, no payment, no push. The GitHub repository is untouched.
```
# 1. runtime (approval)
brew install colima docker
colima start --cpu 2 --memory 4 --disk 20

# 2. the allowlisted bundle (already tested), then the first real build of the Dockerfile
cd app/backend && .venv/bin/python scripts/make_deploy_bundle.py
docker build -t profile-intelligence:staging-20261117 ../deploy/build/bundle
docker images profile-intelligence            # note the size (not measured yet)

# 3. run it the strict way: non root, read only, no extra privileges, 1 GB limit, loopback only
docker run --rm --name pi-staging \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges \
  --memory 1g -p 127.0.0.1:8080:8080 \
  -e PROFILE_TRUST_PROXY=false \
  profile-intelligence:staging-20261117

# 4. verify (another terminal)
.venv/bin/python scripts/smoke_test.py http://127.0.0.1:8080 --no-proxy          # 22 checks
docker inspect pi-staging --format '{{.Config.User}}'                            # expect 1000
docker stats --no-stream pi-staging                                              # memory against the 1 GB limit
docker export pi-staging | tar -t | grep -E 'tier1|classifier|profiles\.csv|\.ipynb|\.env' || echo "no private file in the image"
docker logs pi-staging | python scripts/summarise_logs.py

# 5. private HTTPS to your own phone and Mac (approval for Tailscale first)
tailscale serve --bg 8080          # https://<this-mac>.<your-tailnet>.ts.net, tailnet only
tailscale serve status
tailscale serve reset              # stop sharing when finished
docker stop pi-staging
```
What it proves: the Dockerfile builds, the image starts offline as a non root user with a read only file system, memory fits, nothing private is in the image, and VoiceOver on Mac and iPhone can be tested over https. What it does not prove: a platform's proxy depth, cold start or logs.
Note: `docker run` with `--read-only` is a strict test. If it fails because something writes to disk, that is a finding to fix, not to work around.

### Option B: Google Cloud Run, private
Permissions and approvals:
- **[approval] A Google account and a Google Cloud billing account** (a payment method on file, **Unverified**), a new project linked to it.
- Your own roles on that project: enough to enable services, build, deploy and read logs (for example Owner on a new project), and **`roles/run.invoker`** to call the private service.
- **[approval] Create resources:** Artifact Registry repository, Cloud Run service (and Cloud Build if building in the cloud). An image of about 2 GB is above the 0.5 GB of free registry storage (**Unverified**), which costs cents a month.
```
gcloud auth login
gcloud projects create pi-staging-EXAMPLE                       # approval
gcloud billing projects link pi-staging-EXAMPLE --billing-account=BILLING_ID   # approval, card on file
gcloud config set project pi-staging-EXAMPLE
gcloud services enable run.googleapis.com artifactregistry.googleapis.com
gcloud artifacts repositories create pi --repository-format=docker --location=REGION
docker build -t REGION-docker.pkg.dev/pi-staging-EXAMPLE/pi/profile-intelligence:staging-20261117 app/deploy/build/bundle
docker push  REGION-docker.pkg.dev/pi-staging-EXAMPLE/pi/profile-intelligence:staging-20261117   # approval: uploads the image
gcloud run deploy profile-intelligence-staging \
  --image REGION-docker.pkg.dev/pi-staging-EXAMPLE/pi/profile-intelligence:staging-20261117 \
  --region REGION --no-allow-unauthenticated \
  --memory 2Gi --cpu 1 --min-instances 0 --max-instances 1 --port 8080 \
  --set-env-vars PROFILE_APP_MODE=public,PROFILE_TRUST_PROXY=true,PROFILE_TRUSTED_PROXY_HOPS=1
# budget alert before anything else is done: set one in the console at 50 and 100 percent of a small amount
gcloud run services proxy profile-intelligence-staging --region REGION --port 8081   # authenticated tunnel to localhost:8081
python app/backend/scripts/smoke_test.py http://127.0.0.1:8081 --no-proxy
```
The proxy depth (`PROFILE_TRUSTED_PROXY_HOPS`) must be confirmed with the two network test, but through the authenticated proxy you may see only your own address, so the real test needs a deliberately public check later. Rollback is a traffic shift to the previous revision.

### Option F: Hugging Face PRO (only if you approve a $9 purchase)
Permissions and approvals: **[approval] subscribe to PRO** (payment); a write token (or fine grained token with write access to the Space only), kept only in your password manager; **[approval] create the private Docker Space**; **[approval] push the bundle**.
```
pip install -U huggingface_hub          # the hf command
hf auth login                           # paste the write token when prompted; it is not stored in any project file
# create a PRIVATE Docker Space on the website (Spaces > New Space > SDK: Docker > Visibility: Private)
git clone https://huggingface.co/spaces/OWNER/profile-intelligence-staging      # remote URL form Unverified
# copy in the bundle files and app/deploy/templates/huggingface_space_README.md as README.md, then:
git add . && git commit -m "staging release 20261117" && git push            # approval: publishes code to Hugging Face (private)
```
Needed before this works: a staging only setting that allows framing from `https://huggingface.co` (not built), and a test of whether the smoke test can reach a private Space. If you choose this, I will build and test the framing setting first.

## 6. What has changed in the repository for this revision
Only documents, plus one line in `Dockerfile` (container user id 1000, which Hugging Face requires and which is harmless elsewhere). No application code changed.
