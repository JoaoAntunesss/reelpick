#!/bin/sh
# Stamp every local import and the CSS/JS links with a new version so browsers never mix old and new files.
V=$(date +%s)
cd "$(dirname "$0")/.."
for f in *.js; do sed -i -E "s#(from |import\()\"\./([a-z0-9-]+)\.js(\?v=[0-9]+)?\"#\1\"./\2.js?v=$V\"#g" "$f"; done
sed -i -E "s#(style\.css|app\.js)\?v=[0-9]+#\1?v=$V#g" index.html
echo "version $V"
