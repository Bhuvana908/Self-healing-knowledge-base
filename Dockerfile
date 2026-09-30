# Multi-stage: build the React SPA, then serve it from the FastAPI app via STATIC_DIR.
FROM node:24-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY frontend/ ./
RUN yarn build

FROM python:3.12-slim
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend /app/frontend/dist /app/static
ENV STATIC_DIR=/app/static
# SECRET_KEY is REQUIRED at runtime and must not be a known default — the app refuses to start otherwise:
#   docker run -e SECRET_KEY=$(python -c "import secrets; print(secrets.token_hex(32))") ...
EXPOSE 8001
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
