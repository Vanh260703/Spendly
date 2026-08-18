#!/bin/sh
# Phục hồi DB trong Docker từ một file dump.
#
#   sh docker/restore.sh docker/backups/spendly-20260817-213406.sql
#
# ⚠️ GHI ĐÈ TOÀN BỘ DB `spendly` trong container. Không có bước hoàn tác.
set -e

DUMP="$1"
[ -z "$DUMP" ] && { echo "Thiếu tham số: sh docker/restore.sh <file.sql>"; exit 1; }
[ -f "$DUMP" ] || { echo "Không thấy file: $DUMP"; exit 1; }

echo "→ Dừng API để không ai ghi vào giữa chừng..."
docker compose stop be >/dev/null

echo "→ Nạp $DUMP ..."
# ON_ERROR_STOP: nạp nửa chừng rồi lỗi mà vẫn bật app lên là tệ nhất — thà dừng hẳn
docker compose exec -T postgres psql -q -U spendly -d spendly -v ON_ERROR_STOP=1 < "$DUMP"

echo "→ Bật lại API..."
docker compose start be >/dev/null
echo "✓ Xong"
