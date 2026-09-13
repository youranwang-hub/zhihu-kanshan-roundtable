#!/usr/bin/env bash
set -euo pipefail
stage="$1"
[[ "$stage" =~ ^/home/ubuntu/kanshan-deploy-[0-9]+$ ]] || exit 1
nginx -t
test ! -e /etc/nginx/sites-enabled/roundtable
mkdir -p /opt/kanshan/releases /etc/kanshan /var/www/kanshan-acme
chmod 700 /etc/kanshan
id kanshan >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin kanshan

if [ ! -x /opt/kanshan/node/bin/node ]; then
python3 - <<'PY'
import json, urllib.request, hashlib, pathlib, subprocess
base = 'https://nodejs.org/dist/'
versions = json.load(urllib.request.urlopen(base + 'index.json', timeout=30))
version = next(v['version'] for v in versions if v['version'].startswith('v22.') and v.get('lts'))
name = f'node-{version}-linux-x64.tar.xz'
checks = urllib.request.urlopen(base + version + '/SHASUMS256.txt', timeout=30).read().decode()
expected = next(line.split()[0] for line in checks.splitlines() if line.split()[-1] == name)
target = pathlib.Path('/opt/kanshan') / name
urllib.request.urlretrieve(base + version + '/' + name, target)
assert hashlib.sha256(target.read_bytes()).hexdigest() == expected, 'Node checksum mismatch'
subprocess.run(['tar', '-xJf', str(target), '-C', '/opt/kanshan'], check=True)
pathlib.Path('/opt/kanshan/node').symlink_to('/opt/kanshan/' + name.removesuffix('.tar.xz'))
target.unlink()
print('Installed verified Node ' + version, flush=True)
PY
fi

release="/opt/kanshan/releases/$(basename "$stage")"
install -m 600 "$stage/environment" /etc/kanshan/environment
rm -- "$stage/environment"
mv "$stage" "$release"
chown -R root:root "$release"
find "$release" -type d -exec chmod 755 {} +
find "$release" -type f -exec chmod 644 {} +
ln -sfn "$release" /opt/kanshan/current
install -m 644 "$release/deploy/kanshan.service" /etc/systemd/system/kanshan.service
systemctl daemon-reload
systemctl enable --now kanshan
sleep 2
curl -fsS http://127.0.0.1:4173/api/health

# Only this new virtual host is added; existing websites keep their configuration.
printf '%s\n' 'server { listen 80; server_name roundtable.xiaoshixuji.xyz; location /.well-known/acme-challenge/ { root /var/www/kanshan-acme; } location / { proxy_pass http://127.0.0.1:4173; } }' > /etc/nginx/sites-available/roundtable
ln -s /etc/nginx/sites-available/roundtable /etc/nginx/sites-enabled/roundtable
nginx -t
systemctl reload nginx
certbot certonly --webroot -w /var/www/kanshan-acme -d roundtable.xiaoshixuji.xyz --non-interactive --agree-tos --register-unsafely-without-email
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\n/usr/sbin/nginx -t && /bin/systemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/kanshan-nginx-reload
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/kanshan-nginx-reload
install -m 644 "$release/deploy/roundtable.nginx.conf" /etc/nginx/sites-available/roundtable
nginx -t
systemctl reload nginx
systemctl is-active kanshan nginx
curl -fsS https://roundtable.xiaoshixuji.xyz/api/health
