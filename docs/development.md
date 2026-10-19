# Development and validation

Run `sh scripts/test-native-host.sh` from the repository root on Linux to build and exercise the native installation in a disposable Docker-in-Docker Engine. It tests HTTPS administrator setup without a host HTTP listener, direct-IP ingress, local deployments and exact-image rollback, networks/hostnames, terminal/SSE transport, certificate renewal failure and protected cleanup. A separate protected updater fixture replaces both packaged components in both directions while unrelated application traffic runs. It binds the web frontend explicitly to `127.0.0.2` so HTTPS health checks must respect custom bindings. Registry downloads use synthetic manifests mapped to locally built images; Docker, Compose, PostgreSQL, HAProxy, backups, migration commands and HTTPS health checks are real. The test passes no outer Docker socket into the isolated engine. It removes only its unique fixture at exit and also runs in CI.

Use Go 1.26+, Bun 1.4+, Docker Engine and Compose. `go test ./api/... ./cmd/... ./internal/... ./tests/...` runs all Go packages without traversing frontend dependencies on Windows mounts. Set `TEST_DATABASE_URL` to a disposable PostgreSQL database to also run database/API tests. Backup tests need `pg_dump` and `pg_restore` matching the server's major version. The `tests/Dockerfile` image provides the complete Go/PostgreSQL toolchain.

```sh
cd web
bun install --frozen-lockfile
bun run build
cd ..
go test ./api/... ./cmd/... ./internal/... ./tests/...
go vet ./api/... ./cmd/... ./internal/... ./tests/...
go build ./cmd/shipyard
```

The dashboard uses React Router framework SPA mode. `bun run build` generates route types, checks TypeScript, builds `web/build/client`, and copies those assets to `internal/web/dist` for embedding in Go. For development, run PostgreSQL separately and export `DATABASE_URL`, `SHIPYARD_MASTER_KEY`, `SHIPYARD_BOOTSTRAP_TOKEN`, and `SHIPYARD_ORIGIN=http://localhost:5173`. Run `go run ./cmd/shipyard` and `cd web && bun dev`; Vite proxies API and WebSocket requests to port 8080. The generated frontend assets are intentionally ignored by Git.

`node scripts/openapi.mjs` regenerates the API document, followed by `cd web && bun run api:generate`. Run `sqlc generate` to regenerate the PostgreSQL query bindings. Generated artifacts are committed; CI checks regeneration drift.

Browser tests use Playwright and an actual running Shipyard API, with an isolated database and installation bootstrap token. Provider tests use local fake HTTP servers. Live GitHub/Gitea, DNS and ACME checks require separately supplied credentials and are not part of default tests.

Run `bun run test` in `web` for frontend transport tests. For browser tests, set `SHIPYARD_E2E_URL` to an isolated running installation and `SHIPYARD_E2E_ENV_FILE` to its environment file (or supply `SHIPYARD_BOOTSTRAP_TOKEN`). The tests initialize the first administrator and create test teams, users and applications. Never point these tests at an installation with real users. Optional `SHIPYARD_E2E_EMAIL` and `SHIPYARD_E2E_PASSWORD` must match the test administrator on repeated runs. Install Chromium using `bunx playwright install chromium`, or set `PLAYWRIGHT_CHANNEL=msedge` to use installed Edge. Then run `bun run test:e2e` in `web`.

Linux integration tests use a dedicated Docker-in-Docker container as an SSH deployment host. The test runner needs only network access and a test SSH key; **do not mount the host Docker socket into it**. A typical setup is:

```sh
node scripts/integration-key.mjs
docker network create shipyard-test
docker build -t shipyard:ssh-fixture tests/sshd
docker run -d --privileged --name shipyard-integration-fixture --network shipyard-test --env-file .local/fixture.env -e DOCKER_TLS_CERTDIR= shipyard:ssh-fixture
```

Wait for `docker exec shipyard-integration-fixture docker info` to succeed. Run `go test ./internal/control -run TestLinux -v -count=1` from a Linux runner on this network, with `SHIPYARD_INTEGRATION=1`, `SHIPYARD_FIXTURE_HOST=shipyard-integration-fixture`, `SHIPYARD_FIXTURE_PRIVATE_KEY_FILE` pointing at `.local/integration_rsa`, and a reachable disposable `TEST_DATABASE_URL`. The fixture has no host mounts and publishes no ports. Remove it after testing with `docker rm -fv shipyard-integration-fixture`.

The GitHub Actions workflow provides an executable version of this setup, tests continuous traffic, WebSockets, gRPC streaming, both TCP TLS modes, exact-image rollback and Compose volume preservation, and then runs desktop/mobile browser checks.

`TestLinuxHostnameMapsAndRecovery` uses the same isolated SSH fixture to check hostname normalization, exact/wildcard precedence, unchanged request paths, invalid map validation, interrupted map recovery and unbindable-address recovery. Run it after `TestLinuxDeploymentRollbackAndProtocols` when sharing a fixture; both replace the fixture's managed proxy configuration. Git setup tests use fake providers and assert that no Gitea webhook-management requests are made.

`TestLinuxDirectComposeDeployAndRollback` deploys raw YAML without any Git provider, checks immutable queued source, image-only and inline Dockerfile builds, exact-image rollback, failed-health recovery and named-volume preservation. It uses `busybox:1.37.0` and the managed HAProxy image inside the isolated fixture. `web/e2e/direct-compose.spec.ts` mocks API responses to exercise creation, source editing, stale-save errors, revision-bound Save & deploy and viewer restrictions on desktop/mobile. Run it against a dashboard preview with `bun run test:e2e direct-compose.spec.ts`.

The Direct Compose integration includes an obsolete `version` attribute to generate a real Compose stderr warning, and an invalid configuration to check complete failure diagnostics without value substitution. Structured SSH commands capture stdout separately from stderr; streaming build commands still combine both. `internal/remote/output_test.go` checks this boundary over a real SSH connection. Deployment errors appear in retained log events and above the dashboard log panel, including errors from older failed deployments.

The lazy-loaded Monaco editor uses local ESM workers and `monaco-yaml`. Keep `web/src/lib/monaco.ts` worker imports aligned with the pinned Monaco version. The Compose schema and its provenance live under `web/src/lib/schemas`; distributed license notices live under `web/public/licenses`. Browser checks exercise YAML schema diagnostics, completion, formatting, keyboard focus escape, theme/layout and editing under the production CSP without external requests. Monaco does not officially support mobile browsers; the suite checks the supported interactions on the mobile viewport as well.

Monaco is pinned to 0.52.2 because the YAML worker manager uses its `moduleId`/`createData` worker API. Upgrade Monaco and the YAML worker integration together and rerun the CSP/tooling browser checks; successful compilation alone does not verify worker compatibility.

Optional live read checks: set `SHIPYARD_LIVE_DNS=1`, `SHIPYARD_TEST_DNS_PROVIDER`, `SHIPYARD_TEST_DNS_TOKEN`, and `SHIPYARD_TEST_DNS_ZONE`, then run `go test ./internal/providers -run TestLiveDNS -v`. Use `SHIPYARD_LIVE_GITEA=1`, `SHIPYARD_TEST_GITEA_URL`, and `SHIPYARD_TEST_GITEA_TOKEN` for `TestLiveGitea`. These checks only list records/repositories. Live DNS mutation and ACME issuance require deliberate dashboard actions; CI never uses real provider credentials.

Release publication additionally runs `scripts/test-release-path.sh` against the preceding published image and both schema directions. Initial release 0.1.0 has no published predecessor. `tests/installer.sh` exercises installer success, resumption, credential preservation and damaged/missing checksums without Docker access. HTTP-01 tests use a local RFC 8555 fake CA and expiring token storage; live Let’s Encrypt issuance remains opt-in.

`TestLinuxPrivateReadinessAndVolumeInventory` uses the same isolated SSH fixture to check HTTP readiness for two private replicas without proxy targets, volume data sizes, retained unused volumes, replacement identity rejection, and preparation failures that preserve running containers. Dashboard coverage is in `web/e2e/application-storage-logs.spec.ts`.
