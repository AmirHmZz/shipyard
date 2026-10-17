FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN mkdir -p internal/web/dist && echo '<!doctype html><title>Native integration</title>' > internal/web/dist/index.html
RUN CGO_ENABLED=0 go test -c -o /native.test ./internal/api

FROM shipyard:native-check
COPY --from=build /native.test /native.test
USER shipyard
ENTRYPOINT ["/native.test"]
