# 운영 이미지 — AI 분석 워커 (Jira S15P31A102-96). 굽는 곳은 CI 의 w4:ai(.gitlab-ci.yml), 정한 것은 SSOT.md 6절
# 로컬 개발은 이 파일을 쓰지 않는다 — compose.yaml 이 폴더를 연결해 uvicorn --reload 로 띄운다
# 이미지는 digest 로 고정한다. 태그는 사람이 읽으라고 남긴다

# 1단계 — 가상환경 만들기. compose 의 ai 컨테이너와 같은 uv 이미지다
FROM ghcr.io/astral-sh/uv:0.13.1-python3.14-trixie-slim@sha256:112f89760bd54b63c84d140151ea5f3d849278e54f6f939f2c40a57f3e33d895 AS build
# 이미지의 Python 을 쓰고(ai/.python-version), 받은 파일을 가상환경에 복사하고, 미리 컴파일해 둔다
# — 실행 이미지는 root 가 아니라 __pycache__ 를 쓸 수 없다
ENV UV_PYTHON_DOWNLOADS=never \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1
WORKDIR /app
# 잠금 파일이 그대로면 의존성 층(torch CPU 판 포함, 약 1 GB)을 다시 쓴다. 개발 도구(ruff · pytest)는 넣지 않는다
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev --no-install-project
COPY app ./app

# 2단계 — 실행. 1단계와 같은 Python 3.14.8 이 같은 자리(/usr/local)에 있어야 가상환경이 그대로 돈다
FROM python:3.14.8-slim-trixie@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170
ENV PATH=/app/.venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY --from=build /app /app
# root 가 아닌 사용자로 돈다 (쿠버네티스 runAsNonRoot 를 쓸 수 있게 숫자로)
USER 10001:10001
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
