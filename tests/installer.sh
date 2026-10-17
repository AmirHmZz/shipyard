#!/bin/sh
# Runs in a disposable container without a Docker socket or real credentials.
set -eu
tmp=$(mktemp -d)
trap 'rm -rf "$tmp" /opt/shipyard' EXIT HUP INT TERM
mkdir -p "$tmp/bin" "$tmp/assets"
export SHIPYARD_INSTALL_TEST="$tmp"
printf 'services: {}\n' > "$tmp/assets/compose.host.yaml"
printf '{\n  "version": "0.1.0",\n  "executorImage": "ghcr.io/amirhmzz/shipyard-executor@sha256:%064d"\n}\n' 0 > "$tmp/assets/release.json"
(cd "$tmp/assets";sha256sum release.json compose.host.yaml > SHA256SUMS)
cat > "$tmp/bin/curl" <<'EOF'
#!/bin/sh
output= url=
while [ "$#" -gt 0 ];do case "$1" in -o) output="$2";shift 2;; http*) url="$1";shift;; *) shift;;esac;done
if [ -z "$output" ];then printf '{"tag_name": "v0.1.0"}\n';exit 0;fi
name=${url##*/}
cp "$SHIPYARD_INSTALL_TEST/assets/$name" "$output"
if [ "${DAMAGED:-}" = true ] && [ "$name" = compose.host.yaml ];then echo damaged >> "$output";fi
if [ "${MISSING:-}" = true ] && [ "$name" = SHA256SUMS ];then sed -i '/compose.host.yaml/d' "$output";fi
EOF
cat > "$tmp/bin/docker" <<'EOF'
#!/bin/sh
case "$*" in
 'compose version --short') echo 2.24.0;;
 *' dashboard-access status') echo '{"activeDomain":"panel.example.com"}';;
 *' install-finish') if [ ! -e /opt/shipyard/.shown ];then echo 'First administrator bootstrap token: test-only';touch /opt/shipyard/.shown;fi;;
 *' install panel.example.com '*)
  if [ ! -f /opt/shipyard/install.json ];then echo 'persistent-key' >/opt/shipyard/.env;printf '{\n "version": "0.1.0"\n}\n' >/opt/shipyard/install.json;fi;;
 *) :;;
esac
EOF
chmod +x "$tmp/bin/curl" "$tmp/bin/docker"
export PATH="$tmp/bin:$PATH"
run(){ sh /src/install.sh --version 0.1.0 --domain panel.example.com --public-ipv4 192.0.2.10 --accept-acme-tos; }
run > "$tmp/first"
grep -q 'https://panel.example.com' "$tmp/first"
grep -q 'bootstrap token: test-only' "$tmp/first"
cp /opt/shipyard/.env "$tmp/original"
run > "$tmp/resume"
cmp /opt/shipyard/.env "$tmp/original"
if grep -q 'bootstrap token' "$tmp/resume";then echo 'Bootstrap token repeated' >&2;exit 1;fi
rm -rf /opt/shipyard
if DAMAGED=true run > "$tmp/damaged" 2>&1;then echo 'Damaged installation accepted' >&2;exit 1;fi
test ! -e /opt/shipyard/.env
if MISSING=true run > "$tmp/missing" 2>&1;then echo 'Missing installation checksum accepted' >&2;exit 1;fi
test ! -e /opt/shipyard/.env
mkdir -p /opt/shipyard
echo preserve >/opt/shipyard/.env
if run > "$tmp/conflict" 2>&1;then echo 'Conflicting installation accepted' >&2;exit 1;fi
test "$(cat /opt/shipyard/.env)" = preserve
echo 'Installer success, resume, key preservation and damaged/missing artifact rejection passed.'
