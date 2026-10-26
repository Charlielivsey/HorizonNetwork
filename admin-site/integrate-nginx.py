#!/usr/bin/env python3
"""Add the central gate to known website hosts, never admin or unrelated hosts.
Wildcard includes survive future site installations and are harmless before control is installed.
"""
import argparse,json,re
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--root',default='/etc/nginx');parser.add_argument('--source',action='store_true');parser.add_argument('--check',action='store_true');args=parser.parse_args()
repo=Path(__file__).resolve().parent.parent
catalog=json.loads((Path(__file__).resolve().parent/'catalog.json').read_text())
hosts={h:s['id'] for s in catalog for h in s['hosts']}
def masked(text):
    # Preserve offsets while ignoring braces inside quoted strings and comments.
    out=list(text);quote=None;comment=False;escaped=False
    for i,c in enumerate(text):
        if comment:
            if c=='\n':comment=False
            else:out[i]=' '
        elif quote:
            out[i]=' '
            if escaped:escaped=False
            elif c=='\\':escaped=True
            elif c==quote:quote=None
        elif c in '\"\'':quote=c;out[i]=' '
        elif c=='#':comment=True;out[i]=' '
    return ''.join(out)
def patch(text):
    mask=masked(text);edits=[]
    for match in re.finditer(r'(?m)^\s*server\s*\{',mask):
        start=match.start();cursor=match.end();depth=1
        while cursor<len(mask) and depth:
            depth+=(mask[cursor]=='{')-(mask[cursor]=='}');cursor+=1
        if depth:raise ValueError('Unclosed nginx server block')
        block=text[start:cursor];m=re.search(r'\bserver_name\s+([^;]+);',block)
        if not m:continue
        ids={hosts[h] for h in m[1].split() if h in hosts}
        if not ids:continue
        if len(ids)!=1:raise ValueError('Mixed controlled hosts in one server block')
        site=ids.pop();line=f'\n    include /etc/nginx/hn-control/enabled/{site}-*.conf; # HN website control\n'
        if 'hn-control/enabled/' not in block:block=block[:m.end()]+line+block[m.end():]
        block=re.sub(r'(location\s+(?:\^~\s+)?/\.well-known/acme-challenge/\s*\{)(?!\s*auth_request off;)',r'\1 auth_request off;',block)
        edits.append((start,cursor,block))
    for start,end,block in reversed(edits):text=text[:start]+block+text[end:]
    return text
paths=[]
if args.source:
    for folder in ['auth-site','hngroup-site/nginx','horizon-network-site','staff-portal','status-site','links-site','wiki-site','branding-site','companies-site','vpn-site','investors-site','accounts-site','devices-site','documents-site','downloads-site','horizon-advertising']+[s+'-site' for s in ['media','holding','development','support','clients','careers','docs','news']]:
        paths.extend((repo/folder).glob('*.conf'))
else:
    root=Path(args.root)
    paths=[p.resolve() for p in (root/'sites-enabled').glob('*') if p.is_file()]
    paths+=list((root/'conf.d').glob('*.conf'))
for p in dict.fromkeys(paths):
    old=p.read_text();new=patch(old)
    if new!=old:
        if args.check:raise SystemExit('Missing gate integration: '+str(p))
        p.write_text(new);print('Integrated '+str(p))
# HN Group's shared server snippet contains its actual ACME location.
p=(repo/'hngroup-site/nginx/hngroup-site.conf') if args.source else Path(args.root)/'snippets/hngroup-site.conf'
if p.exists():
    old=p.read_text();new=re.sub(r'(location\s+\^~\s+/\.well-known/acme-challenge/\s*\{)(?!\s*auth_request off;)',r'\1 auth_request off;',old)
    if new!=old:
        if args.check:raise SystemExit('Missing ACME exemption: '+str(p))
        p.write_text(new)
