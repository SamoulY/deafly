import os, subprocess, sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
env=os.environ.copy()
credential=Path.home()/'.openclaw/credentials/cloudflare-token.txt'
if credential.exists(): env['CLOUDFLARE_API_TOKEN']=credential.read_text().strip()
args=sys.argv[1:]
if not args: raise SystemExit('Usage: cf-command.py wrangler-arguments')
result=subprocess.run([str(root/'node_modules/.bin/wrangler'),*args],cwd=root/'worker',env=env)
raise SystemExit(result.returncode)
