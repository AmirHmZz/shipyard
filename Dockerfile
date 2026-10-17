FROM oven/bun:1.4.2-alpine AS frontend
WORKDIR /src/web
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY web ./
RUN bun run build

FROM golang:1.26-alpine AS backend
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /src/internal/web/dist ./internal/web/dist
ARG VERSION=dev
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown
ARG TARGETOS=linux
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags="-s -w -X shipyard/internal/buildinfo.Version=${VERSION} -X shipyard/internal/buildinfo.Commit=${VCS_REF} -X shipyard/internal/buildinfo.BuiltAt=${BUILD_DATE}" -o /shipyard ./cmd/shipyard
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags="-s -w -X shipyard/internal/buildinfo.Version=${VERSION} -X shipyard/internal/buildinfo.Commit=${VCS_REF} -X shipyard/internal/buildinfo.BuiltAt=${BUILD_DATE}" -o /shipyard-executor ./cmd/shipyard-executor

FROM docker:29-cli AS host-executor
RUN apk add --no-cache postgresql18-client
ARG VERSION=dev
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.version=$VERSION org.opencontainers.image.revision=$VCS_REF org.opencontainers.image.created=$BUILD_DATE org.opencontainers.image.source="https://github.com/AmirHmZz/shipyard"
COPY --from=backend /shipyard-executor /usr/local/bin/shipyard-executor
ENTRYPOINT ["shipyard-executor"]
CMD ["idle"]

FROM alpine:3.23
RUN apk add --no-cache ca-certificates git postgresql18-client tzdata && addgroup -g 10001 shipyard && adduser -D -u 10001 -G shipyard shipyard && mkdir /data && chown shipyard:shipyard /data
ARG VERSION=dev
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.version=$VERSION org.opencontainers.image.revision=$VCS_REF org.opencontainers.image.created=$BUILD_DATE org.opencontainers.image.source="https://github.com/AmirHmZz/shipyard"
COPY --from=backend /shipyard /usr/local/bin/shipyard
USER shipyard
WORKDIR /data
ENV SHIPYARD_DATA_DIR=/data SHIPYARD_LISTEN=:8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -q -O /dev/null "http://127.0.0.1:${SHIPYARD_LISTEN##*:}/healthz" || exit 1
ENTRYPOINT ["shipyard"]
