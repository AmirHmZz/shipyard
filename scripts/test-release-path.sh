#!/bin/sh
# Publication gate: use real image digests against the preceding published schema.
set -eu
manifest=${1:-.local/release/release.json}
previous=$(jq -r .previous "$manifest")
if [ -z "$previous" ];then echo 'Initial release: no preceding published schema; native synthetic version-change checks apply.';exit 0;fi
tmp=$(mktemp -d)
network="shipyard-release-path-$(cat /proc/sys/kernel/random/uuid)"
cleanup(){ docker rm -fv "$network-db" >/dev/null 2>&1 || true;docker network rm "$network" >/dev/null 2>&1 || true;rm -rf "$tmp"; }
trap cleanup EXIT HUP INT TERM
base="https://github.com/AmirHmZz/shipyard/releases/download/v$previous"
curl -fsSL "$base/release.json" -o "$tmp/release.json"
curl -fsSL "$base/SHA256SUMS" -o "$tmp/SHA256SUMS"
(cd "$tmp";grep '  release.json$' SHA256SUMS | sha256sum -c -)
old_image=$(jq -r .coreImage "$tmp/release.json")
new_image=$(jq -r .coreImage "$manifest")
for image in "$old_image" "$new_image";do printf '%s' "$image" | grep -Eq '^ghcr.io/amirhmzz/shipyard@sha256:[a-f0-9]{64}$';docker pull "$image";done
docker network create "$network" >/dev/null
docker run -d --name "$network-db" --network "$network" -e POSTGRES_PASSWORD=release-test -e POSTGRES_DB=shipyard postgres:18-alpine >/dev/null
for attempt in $(seq 1 60);do if docker exec "$network-db" pg_isready -U postgres >/dev/null 2>&1;then break;fi;sleep 1;done
db="postgres://postgres:release-test@$network-db:5432/shipyard?sslmode=disable"
old_schema=$(jq -r .schema "$tmp/release.json")
new_schema=$(jq -r .schema "$manifest")
jq -S '.migrations' "$tmp/release.json" > "$tmp/old-migrations.json"
jq -S --argjson count "$old_schema" '.migrations[:$count]' "$manifest" > "$tmp/preserved-migrations.json"
cmp "$tmp/old-migrations.json" "$tmp/preserved-migrations.json"
docker run --rm --network "$network" -e DATABASE_URL="$db" "$old_image" migrate apply "$old_schema" --allow-data-loss
docker exec "$network-db" psql -U postgres -d shipyard -v ON_ERROR_STOP=1 -c "INSERT INTO settings(key,value) VALUES('release-test-sentinel','{\"preserved\":true}')"
docker run --rm --network "$network" -e DATABASE_URL="$db" "$new_image" migrate catalog > "$tmp/catalog.json"
jq -S '.migrations' "$manifest" > "$tmp/expected.json"
jq -S . "$tmp/catalog.json" > "$tmp/actual.json"
cmp "$tmp/actual.json" "$tmp/expected.json"
docker run --rm --network "$network" -e DATABASE_URL="$db" "$new_image" migrate apply "$new_schema" --allow-data-loss
docker run --rm --network "$network" -e DATABASE_URL="$db" "$new_image" migrate plan "$old_schema" > "$tmp/down-plan.json"
if jq -e '.steps | any(.classification == "unsupported")' "$tmp/down-plan.json" >/dev/null;then
 if docker run --rm --network "$network" -e DATABASE_URL="$db" "$new_image" migrate apply "$old_schema" --allow-data-loss;then echo 'Unsupported reverse migration executed' >&2;exit 1;fi
 docker run --rm --network "$network" -e DATABASE_URL="$db" "$new_image" migrate status | jq -e --argjson schema "$new_schema" '.current == $schema'
 echo 'Unsupported reverse path correctly refused; upgrade schema remains intact.'
 exit 0
fi
docker run --rm --network "$network" -e DATABASE_URL="$db" "$new_image" migrate apply "$old_schema" --allow-data-loss
docker run --rm --network "$network" -e DATABASE_URL="$db" "$old_image" migrate status
test "$(docker exec "$network-db" psql -U postgres -d shipyard -Atc "SELECT value->>'preserved' FROM settings WHERE key='release-test-sentinel'")" = true
echo 'Preceding published release migrations passed in both directions.'
