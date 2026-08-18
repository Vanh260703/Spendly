# ───────────────────────── Giai đoạn build ─────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Copy manifest trước rồi mới cài: Docker cache lớp này lại, sửa code không phải cài lại
COPY package*.json ./
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ──────────────────────── Giai đoạn chạy thật ────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

# `--omit=dev` bỏ devDependencies. TypeORM là dependency THẬT nên CLI `typeorm` vẫn còn,
# đủ để chạy migration trên bản đã build (`migration:run:prod`) mà không cần ts-node.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Không chạy bằng root — container bị chiếm thì thiệt hại giới hạn ở quyền của user này
USER node

EXPOSE 3001
ENTRYPOINT ["./docker-entrypoint.sh"]
