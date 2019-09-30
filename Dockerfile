# Compile Backend (Go)
FROM golang:1.12-alpine as builder
RUN apk update && apk add --no-cache git ca-certificates && update-ca-certificates

WORKDIR /app

# 1. install dependencies for go backend
COPY ./backend/go.mod .
COPY ./backend/go.sum .
RUN go mod download

# 2. copy all folders
COPY ./backend .
RUN CGO_ENABLED=0 go build -o /go/bin/kafka-owl ./cmd/api

# executable image
FROM alpine:3.9
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /go/bin/kafka-owl /go/bin/kafka-owl

ENV VERSION 1.0.0
ENTRYPOINT ["/go/bin/kafka-owl"]
