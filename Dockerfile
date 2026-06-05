############################################################
# Frontend Build
############################################################
FROM oven/bun:1-alpine AS frontendBuilder

WORKDIR /app

RUN apk add --no-cache nodejs python3 make g++ gcc git

COPY frontend/package.json frontend/bun.lock ./
# lefthook requires a git repo during prepare
RUN git init -q && bun install --frozen-lockfile

COPY frontend/ ./
RUN bun run build
# Built files are now in /app/build/

############################################################
# Backend Build
############################################################
FROM golang:alpine AS builder

RUN apk add --no-cache git ca-certificates && update-ca-certificates

WORKDIR /app

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
COPY --from=frontendBuilder /app/build/ ./pkg/embed/frontend/

RUN CGO_ENABLED=0 go build -o /app/console ./cmd/api

############################################################
# Final Image
############################################################
FROM alpine:3.21

WORKDIR /app

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app/console /app/console

EXPOSE 8080

ENTRYPOINT ["/app/console"]
