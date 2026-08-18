#!/bin/sh
# Chuyển dữ liệu từ Postgres LOCAL (Homebrew) sang Postgres trong Docker.
#
#   sh docker/migrate-local-to-docker.sh
#
# ⚠️ GHI ĐÈ TOÀN BỘ DB `spendly` trong container. DB local KHÔNG bị đụng vào (chỉ đọc),
# nên chạy sai vẫn còn nguyên bản gốc để làm lại.
set -e

LOCAL_URL="${LOCAL_URL:-postgresql://spendly:spendly@localhost:5432/spendly}"
DUMP="./docker/spendly-dump-$(date +%Y%m%d-%H%M%S).sql"

echo "→ 1/4 Dump từ Postgres local..."
# `--clean --if-exists`: bản dump tự dọn bảng do migration tạo sẵn trong container,
# nếu không sẽ đụng khóa chính. `--no-owner` để không đòi role không tồn tại.
pg_dump "$LOCAL_URL" --clean --if-exists --no-owner --no-privileges -f "$DUMP"
echo "   $DUMP ($(wc -c < "$DUMP" | tr -d ' ') bytes)"

echo "→ 2/4 Dừng API để không ai ghi vào giữa chừng..."
docker compose stop be >/dev/null

echo "→ 3/4 Nạp vào container..."
docker compose exec -T postgres psql -q -U spendly -d spendly -v ON_ERROR_STOP=1 < "$DUMP"

echo "→ 4/4 Bật lại API..."
docker compose start be >/dev/null

echo "✓ Xong. Bản dump giữ lại ở $DUMP để phòng khi cần."
