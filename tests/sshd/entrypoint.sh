#!/bin/sh
set -eu
ssh-keygen -A
mkdir -p /root/.ssh
chmod 700 /root/.ssh
printf '%s\n' "$SHIPYARD_TEST_AUTHORIZED_KEY" > /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
/usr/sbin/sshd -p 2222 -o PermitRootLogin=prohibit-password -o PasswordAuthentication=no -o AllowTcpForwarding=yes
exec /usr/local/bin/dockerd-entrypoint.sh "$@"
