# ───────────────────────── Giai đoạn build ─────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# ⚠️ `NEXT_PUBLIC_*` là biến BUILD-TIME — Next nhúng thẳng giá trị vào bundle.
# Đổi URL API phải BUILD LẠI image, không sửa được bằng biến môi trường lúc chạy.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# ──────────────────────── Giai đoạn chạy thật ────────────────────────
# `output: 'export'` sinh ra HTML/JS tĩnh nên KHÔNG cần Node lúc chạy — nginx là đủ và
# nhẹ hơn hẳn. Đây cũng chính là thứ Cloudflare Pages phục vụ khi deploy thật.
FROM nginx:alpine AS runtime

COPY --from=build /app/out /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
