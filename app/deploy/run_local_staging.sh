#!/bin/bash
# Run the staging image on this computer as strictly as the image allows, reachable ONLY from this computer.
#
#   app/deploy/run_local_staging.sh IMAGE [extra docker run options]
#   app/deploy/run_local_staging.sh profile-intelligence:staging-20261116
#   app/deploy/run_local_staging.sh profile-intelligence:staging-20261116 -e PROFILE_RATE_LIMIT_SEARCH_PER_MINUTE=1000   # for the browser suites
#
# What the options do:
#   --read-only                          the image file system cannot be written. A write is a bug to fix, not to allow.
#   --tmpfs /tmp:...                     the only writable place, in memory, no executables, 64 MB
#   --cap-drop ALL, no-new-privileges    no Linux capabilities and no way to gain any
#   --pids-limit 256                     a runaway process cannot exhaust the machine
#   --memory 1g --memory-swap 1g         a hard 1 GB limit with no swap: the application needs about 620 MB
#   -p 127.0.0.1:8080:8080               published on the loopback address only, never on the network
#   PROFILE_TRUST_PROXY=false            no proxy in front, so the socket address is the client
# The image itself runs as user id 1000, in public mode, offline.
set -euo pipefail
IMAGE="${1:?usage: run_local_staging.sh IMAGE [docker run options]}"
shift
exec docker run --rm --name pi-staging \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --cap-drop ALL --security-opt no-new-privileges \
  --pids-limit 256 --memory 1g --memory-swap 1g --cpus 2 \
  -p 127.0.0.1:8080:8080 \
  -e PROFILE_TRUST_PROXY=false \
  "$@" "$IMAGE"
