#!/bin/sh
# Sao lưu DB trong Docker ra file.
#
#   sh docker/backup.sh
#
# Vì sao cần: volume `pgdata` nằm trên MÁY NÀY, không đi theo git. Sang máy khác
# `docker compose up` sẽ ra DB trắng. File dump là thứ duy nhất mang dữ liệu đi được.
set -e

OUT="${1:-./docker/backups/spendly-$(date +%Y%m%d-%H%M%S).sql}"
mkdir -p "$(dirname "$OUT")"

docker compose exec -T postgres \
  pg_dump -U spendly -d spendly --clean --if-exists --no-owner --no-privileges > "$OUT"

echo "✓ $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
echo "  ⚠️ File này chứa passwordHash — đừng commit, đừng gửi qua kênh công khai."
