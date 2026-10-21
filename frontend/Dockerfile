# 운영 이미지 — 화면 (Jira S15P31A102-96). 굽는 곳은 CI 의 w4:frontend(.gitlab-ci.yml), 정한 것은 SSOT.md 6절
# 로컬 개발은 이 파일을 쓰지 않는다 — compose.yaml 이 폴더를 연결해 vite 개발 서버를 띄운다
# 이미지는 digest 로 고정한다. 태그는 사람이 읽으라고 남긴다

# 1단계 — 빌드. CI 의 w12:frontend 와 같은 이미지다 (Node 26.12.0)
FROM node:26-trixie@sha256:1b84b89ada025e3b14543cbb837ffaa1c1b5273b841c5b94dd1a8f9c1d8cf7fe AS build
WORKDIR /src
# 잠금 파일이 그대로면 설치 층을 다시 쓴다
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# 2단계 — 정적 파일만 내준다. root 가 아닌 사용자(101)로 8080 에서 듣는 nginx 다
FROM nginxinc/nginx-unprivileged:1.30.6-alpine3.24@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist/ /usr/share/nginx/html/
EXPOSE 8080
