#!/bin/sh
set -eu
umask 077
repo=AmirHmZz/shipyard
root=/opt/shipyard
version= domain= ipv4= ipv6= email= accept=false provided_ip=false
while [ "$#" -gt 0 ]; do
 case "$1" in
  --version) version="$2";shift 2;; --domain) domain="$2";shift 2;;
  --public-ipv4) ipv4="$2";provided_ip=true;shift 2;; --public-ipv6) ipv6="$2";provided_ip=true;shift 2;;
  --email) email="$2";shift 2;; --accept-acme-tos) accept=true;shift;;
  *) echo "Unknown option: $1" >&2;exit 1;;
 esac
done
[ "$(id -u)" = 0 ] || { echo 'Run as root on the native Linux Docker host.' >&2;exit 1; }
[ "$(uname -s)" = Linux ] || exit 1
for cmd in docker curl sha256sum; do command -v "$cmd" >/dev/null || { echo "$cmd is required." >&2;exit 1; };done
docker info >/dev/null
docker compose version >/dev/null
compose_version=$(docker compose version --short | sed 's/^v//;s/-.*//')
if ! printf '%s' "$compose_version" | awk -F. '{exit !(($1>2)||($1==2&&$2>=24))}';then echo 'Docker Compose 2.24 or newer is required.' >&2;exit 1;fi
if [ -z "$version" ] && [ -f "$root/install.json" ]; then version=$(sed -n 's/.*"version": "\([0-9.]*\)".*/\1/p' "$root/install.json" | head -n 1);fi
if [ -z "$version" ]; then version=$(curl -fsSL "https://api.github.com/repos/$repo/releases/latest" | sed -n 's/.*"tag_name": "v\([0-9.]*\)".*/\1/p');fi
printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || { echo 'No published normal release found.' >&2;exit 1; }
[ -n "$domain" ] || { printf 'Dashboard domain: ';read -r domain; }
if [ "$provided_ip" = false ];then
 detected=$(curl -4 -fsS --connect-timeout 5 --max-time 10 https://api.ipify.org || true)
 detected6=$(curl -6 -fsS --connect-timeout 5 --max-time 10 https://api64.ipify.org || true)
 printf 'Server public IPv4 [%s] (type none to omit): ' "$detected";read -r ipv4;ipv4=${ipv4:-$detected};[ "$ipv4" != none ] || ipv4=
 printf 'Server public IPv6 [%s] (type none to omit): ' "$detected6";read -r ipv6;ipv6=${ipv6:-$detected6};[ "$ipv6" != none ] || ipv6=
fi
printf 'Dashboard DNS must point to IPv4 %s and IPv6 %s.\n' "${ipv4:-not configured}" "${ipv6:-not configured}"
if [ -z "$ipv4$ipv6" ]; then echo 'Provide a public IPv4 or IPv6 address.' >&2;exit 1;fi
if [ "$accept" != true ]; then printf "Accept Let's Encrypt terms (https://letsencrypt.org/repository/)? [yes/no]: ";read -r answer;[ "$answer" = yes ] || exit 1;accept=true;fi
if [ ! -f "$root/install.json" ]; then
 for port in 80 443;do if command -v ss >/dev/null && ss -ltnH "sport = :$port" | grep -q .;then echo "Port $port is already occupied." >&2;exit 1;fi;done
fi
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for name in release.json SHA256SUMS compose.host.yaml;do curl -fsSL "https://github.com/$repo/releases/download/v$version/$name" -o "$tmp/$name";done
for name in release.json compose.host.yaml;do
 (cd "$tmp";grep -E "^[a-f0-9]{64}  $name\$" SHA256SUMS > required.sum;test "$(wc -l < required.sum)" = 1;sha256sum -c required.sum)
done
executor=$(sed -n 's/.*"executorImage": "\([^"]*\)".*/\1/p' "$tmp/release.json")
printf '%s' "$executor" | grep -Eq '^ghcr.io/amirhmzz/shipyard-executor@sha256:[a-f0-9]{64}$' || exit 1
docker pull "$executor"
mkdir -p "$root"
if [ -f "$root/install.json" ];then cmp -s "$root/release.json" "$tmp/release.json" || { echo 'Installed release differs; use System updates in the dashboard.' >&2;exit 1; };else
 [ ! -f "$root/.env" ] || { echo 'Unmanaged installation exists; credentials were preserved.' >&2;exit 1; }
 cp "$tmp/release.json" "$root/release.json"
 cp "$tmp/compose.host.yaml" "$root/compose.host.yaml"
fi
docker run --rm --network host -v /var/run/docker.sock:/var/run/docker.sock -v "$root:$root" --entrypoint shipyard-executor "$executor" install "$domain" "$ipv4" "$ipv6" "$email" "$accept"
cd "$root"
docker compose -f compose.host.yaml pull
docker compose -f compose.host.yaml up -d postgres host-executor
ready=false
for attempt in $(seq 1 60);do if docker compose -f compose.host.yaml exec -T postgres pg_isready -h 127.0.0.1 -U shipyard >/dev/null 2>&1;then ready=true;break;fi;sleep 2;done
[ "$ready" = true ] || { echo 'PostgreSQL did not become ready. Re-run to resume.' >&2;exit 1; }
docker compose -f compose.host.yaml run --rm --no-deps shipyard migrate apply
docker compose -f compose.host.yaml up -d --no-deps shipyard
for attempt in $(seq 1 60);do
 if docker compose -f compose.host.yaml exec -T shipyard shipyard dashboard-access retry >/dev/null 2>&1;then break;fi
 sleep 2
done
echo "Point $domain directly to $ipv4 $ipv6 using DNS-only A/AAAA records. Ports 80 and 443 must reach this server."
echo 'Waiting for DNS, certificate issuance and HTTPS routing. Press Ctrl-C to stop waiting; re-run to resume.'
for attempt in $(seq 1 300);do
 state=$(docker compose -f compose.host.yaml exec -T shipyard shipyard dashboard-access status 2>/dev/null || true)
 if printf '%s' "$state" | grep -Fq '"activeDomain":"'"$domain"'"';then
  echo "Open https://$domain to create the first administrator."
  docker run --rm -v "$root:$root" --entrypoint shipyard-executor "$executor" install-finish
  exit 0
 fi
 if [ $((attempt % 6)) = 0 ];then printf '%s\n' "$state";fi
 sleep 5
done
echo 'Setup is still pending. Check DNS/firewall settings and rerun the installer; existing state is preserved.' >&2
exit 1
