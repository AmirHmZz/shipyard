FROM golang:1.26-alpine
RUN apk add --no-cache git docker-cli postgresql18-client openssh-client build-base
WORKDIR /src
CMD ["go", "test", "./..."]
