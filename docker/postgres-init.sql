-- Chạy MỘT LẦN lúc volume dữ liệu còn trống (docker-entrypoint-initdb.d).
-- Sửa file này sau khi đã có dữ liệu thì phải `docker compose down -v` mới chạy lại.

-- DB riêng cho test e2e: `npm test` cố ý dùng Postgres THẬT (không mock), nhưng phải
-- tách khỏi DB dev để test không xóa mất dữ liệu đang dùng.
CREATE DATABASE spendly_test OWNER spendly;

-- `uuid-ossp` cũng được migration InitSchema tạo. Để ở cả hai chỗ là cố ý: migration lo
-- cho mọi môi trường (Railway, máy đồng đội), còn đây lo cho DB test vốn không chạy qua
-- entrypoint của BE.
\connect spendly_test
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
