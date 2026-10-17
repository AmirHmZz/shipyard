FROM docker:29-dind
ARG ALPINE_MIRROR=https://dl-cdn.alpinelinux.org/alpine
RUN sed -i "s@https://dl-cdn.alpinelinux.org/alpine@${ALPINE_MIRROR}@g" /etc/apk/repositories && apk add --no-cache openssh-server
COPY entrypoint.sh /fixture-entrypoint.sh
RUN chmod 700 /fixture-entrypoint.sh
ENTRYPOINT ["/fixture-entrypoint.sh"]
