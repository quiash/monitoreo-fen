#!/usr/bin/env bash
set -euo pipefail
python tools/validate_live.py
python tools/build_runtime_data.py
python tools/export_ana.py --if-ana-updated
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add data/live.json data/status.json data/view.json data/ana-export
find data -maxdepth 1 \( -name 'rain-grid-*.json' -o -name 'rain-surface-*.json' \) -exec git add {} +
if ! git diff --cached --quiet; then
  git commit -m 'Actualizar fuente FEN y estado de consulta'
  for attempt in 1 2 3 4; do
    if git pull --rebase origin main && git push origin HEAD:main; then
      break
    fi
    if [[ -d "$(git rev-parse --git-path rebase-merge)" || -d "$(git rev-parse --git-path rebase-apply)" ]]; then
      git rebase --abort
      exit 1
    fi
    if (( attempt == 4 )); then
      echo 'No se pudo publicar en main después de 4 intentos.' >&2
      exit 1
    fi
    delay=$((5 * attempt))
    echo "Reintentando la publicación en ${delay} s (intento $((attempt + 1)) de 4)." >&2
    sleep "$delay"
  done
fi
python tools/request_pages_build.py
