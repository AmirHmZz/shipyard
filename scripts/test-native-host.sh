#!/bin/sh
# Run from the repository root on a Linux Docker host. All workloads are inside
# a disposable Engine; the test never passes the outer Docker socket to them.
set -eu
fixture="shipyard-native-check-$(cat /proc/sys/kernel/random/uuid)"
cleanup() { docker rm -fv "$fixture" >/dev/null 2>&1 || true; }
trap cleanup EXIT HUP INT TERM
docker build --network=host --build-arg VERSION=0.1.0 -t shipyard:native-check .
docker build --network=host --build-arg VERSION=0.1.1 -t shipyard:native-next .
docker build --network=host --target host-executor --build-arg VERSION=0.1.0 -t shipyard-executor:native-check .
docker build --network=host --target host-executor --build-arg VERSION=0.1.1 -t shipyard-executor:native-next .
docker build --network=host -f tests/update.native.Dockerfile -t shipyard-updates:native-check .
docker build --network=host -f tests/native.Dockerfile -t shipyard-runner:native-check .
docker pull postgres:18-alpine
docker pull haproxy:3.4-alpine
docker pull busybox:1.37.0
docker run -d --privileged --name "$fixture" --label shipyard.test=native-host -e DOCKER_TLS_CERTDIR= docker:29-dind dockerd --host=unix:///var/run/docker.sock
ready=false
for attempt in $(seq 1 90); do
  if docker exec "$fixture" docker info >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
test "$ready" = true
docker save shipyard:native-check shipyard:native-next shipyard-executor:native-check shipyard-executor:native-next shipyard-updates:native-check shipyard-runner:native-check postgres:18-alpine haproxy:3.4-alpine busybox:1.37.0 | docker exec -i "$fixture" docker load
docker exec "$fixture" docker network create native-control >/dev/null
docker exec "$fixture" docker run -d --name native-postgres --network native-control -e POSTGRES_USER=shipyard -e POSTGRES_PASSWORD=shipyard -e POSTGRES_DB=shipyard postgres:18-alpine >/dev/null
ready=false
for attempt in $(seq 1 60); do
  if docker exec "$fixture" docker exec native-postgres pg_isready -h 127.0.0.1 -U shipyard >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
test "$ready" = true
docker exec "$fixture" docker run -d --name shipyard-host-executor --network host --pid host --label shipyard.role=executor -v /var/run/docker.sock:/var/run/docker.sock -v /var/lib/shipyard:/var/lib/shipyard -v /var/lib/docker:/host/docker-root:ro shipyard-executor:native-check >/dev/null
docker exec "$fixture" sh -c 'docker run --rm --name native-test-runner --network native-control --group-add "$(stat -c %g /var/run/docker.sock)" --label shipyard.role=control-plane -e SHIPYARD_NATIVE_INTEGRATION=1 -e TEST_DATABASE_URL="postgres://shipyard:shipyard@native-postgres:5432/shipyard?sslmode=disable" -v /var/run/docker.sock:/var/run/docker.sock shipyard-runner:native-check -test.v=true -test.run=TestLinuxNativeHostBootstrapDeployAndRecovery -test.timeout=15m'

# The updater fixture runs separately from both replaceable platform components.
docker exec "$fixture" docker rm -f shipyard-host-executor >/dev/null
pg_ip=$(docker exec "$fixture" docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' native-postgres)
docker exec "$fixture" docker run --rm --name native-version-updater --network host --label shipyard.role=updater -e SHIPYARD_UPDATE_INTEGRATION=1 -e "TEST_DATABASE_URL=postgres://shipyard:shipyard@$pg_ip:5432/shipyard?sslmode=disable" -v /var/run/docker.sock:/var/run/docker.sock -v /opt/shipyard:/opt/shipyard -v /var/lib/shipyard:/var/lib/shipyard -v shipyard_shipyard_data:/platform-data shipyard-updates:native-check -test.v=true -test.run=TestLinuxNativeVersionChanges -test.timeout=15m
echo 'Native HTTPS, local deployments, rollback and platform upgrade/downgrade checks passed.'
