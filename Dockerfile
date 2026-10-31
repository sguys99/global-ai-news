# syntax=docker/dockerfile:1.7
#
# 로컬 정적 서빙 이미지 — GitHub Pages 배포(deploy.yml)와 같은 산출물(out/)을 nginx로 띄운다.
#   ① builder: Node 22(CI와 같은 버전)에서 npm ci → npm run build
#      (prebuild: initDb --existing → search-index.json → latest.json, 그 뒤 정적 export out/)
#   ② runner: nginx(비루트)가 out/ 을 basePath 와 같은 /global-ai-news/ 서브경로에서 서빙
#
# 콘텐츠는 빌드 시점의 data/app.db 로 굳는다(정적 export — 런타임 DB 접근 없음).
# 새 수집분을 반영하려면 이미지를 다시 빌드한다(docker compose up --build).
# admin/api 는 로컬 `next dev` 전용이라 이 이미지에 없다.

# ---- builder ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# better-sqlite3 는 네이티브 모듈이다. 보통 prebuild 바이너리를 내려받지만,
# 받지 못하면(ABI·네트워크) 소스 빌드로 넘어가므로 node-gyp 도구를 둔다(builder 에만 — 최종 이미지엔 없음).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# data/app.db 를 포함해 소스를 복사한다(.dockerignore 가 node_modules·.next·out·.env* 등을 뺀다).
# 빌드에 API 키는 필요 없다. next/font·OG 이미지 폰트(Google Fonts)를 받으므로 네트워크는 필요하다.
COPY . .
RUN test -f data/app.db || (echo "data/app.db 가 없다 — 정적 빌드는 커밋된 DB 를 읽는다" >&2 && exit 1)
RUN npm run build

# ---- runner ----
FROM nginxinc/nginx-unprivileged:1.30.0-alpine AS runner

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
# GitHub Pages 프로젝트 페이지와 같은 경로 구조: /<repo>/... = out/...
COPY --from=builder /app/out /usr/share/nginx/html/global-ai-news

EXPOSE 8080
