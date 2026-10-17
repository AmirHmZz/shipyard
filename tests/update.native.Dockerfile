FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go test -c -o /updates.test ./internal/platformupdate
FROM shipyard-executor:native-check
COPY --from=build /updates.test /updates.test
COPY compose.host.yaml /fixtures/compose.host.yaml
ENTRYPOINT ["/updates.test"]
