#!/usr/bin/env bash
set -euo pipefail
python tools/validate_live.py
python tools/build_runtime_data.py
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add data/live.json data/status.json data/view.json
find data -maxdepth 1 \( -name 'rain-grid-*.json' -o -name 'rain-surface-*.json' \) -exec git add {} +
if ! git diff --cached --quiet; then
  git commit -m 'Actualizar fuente FEN y estado de consulta'
  git pull --rebase origin main
  git push origin HEAD:main
fi
python tools/request_pages_build.py
