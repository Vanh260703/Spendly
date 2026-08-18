#!/bin/sh
set -e

# `synchronize: false` ở mọi môi trường (SPEC §7) nên schema CHỈ đến từ migration.
# Chạy trước khi app khởi động, và để nó chết hẳn nếu migration lỗi — app chạy trên schema
# cũ còn nguy hiểm hơn là không chạy.
echo "→ Chạy migration..."
npm run migration:run:prod

echo "→ Khởi động API..."
exec node dist/main
