#!/usr/bin/env python3
"""Compose one service website's nginx host from its templates.

    nginx-compose.py <site-dir> pending|https [--alias] [--no-ipv6]

pending: HTTP only; the primary answers 503 until its certificate exists (ACME stays reachable).
https:   HTTP redirects to HTTPS; adds the primary HTTPS server and, with --alias, the alias redirect.
"""
import sys
from pathlib import Path

site = Path(sys.argv[1]); mode = sys.argv[2]; flags = set(sys.argv[3:])
text = (site / 'nginx-http.conf').read_text()
head = text.index('    client_max_body_size')
end = text.index('}\n', text.index('    location / {'))  # end of the proxy location
end = text.index('}\n', end + 2)                          # end of the primary server block
domain = next(line.split()[1].rstrip(';') for line in text.splitlines() if line.strip().startswith('server_name'))
if mode == 'pending':
    body = "    location / { default_type text/plain; return 503 'This website is awaiting its HTTPS certificate. Please try again after setup is complete.'; }\n"
elif mode == 'https':
    body = '    location / { return 301 https://' + domain + '$request_uri; }\n'
else:
    raise SystemExit('mode must be pending or https')
out = text[:head] + body + text[end:]
if mode == 'https':
    out += (site / 'nginx-https.conf').read_text()
    if '--alias' in flags and (site / 'nginx-alias-https.conf').exists():
        out += (site / 'nginx-alias-https.conf').read_text()
if '--no-ipv6' in flags:
    out = ''.join(l for l in out.splitlines(True) if 'listen [::]' not in l)
sys.stdout.write(out)
