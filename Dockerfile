# Backend Build
FROM golang:1.12-alpine as builder
RUN apk update && apk add --no-cache git ca-certificates && update-ca-certificates

WORKDIR /app

COPY ./backend/go.mod .
COPY ./backend/go.sum .
RUN go mod download

COPY ./backend .
RUN CGO_ENABLED=0 go build -o ./bin/kafka-owl ./cmd/api
# Compiled backend binary is in '/app/bin/' named 'kafka-owl'



# Frontend Build
# copy frontend (to /app/frontend/) and build it
FROM node:12-alpine as frontendBuilder
WORKDIR /app
ENV PATH /app/node_modules/.bin:$PATH

COPY ./frontend/package.json ./package.json
RUN npm install

COPY ./frontend ./
RUN npm run build
# All the built frontend files for the SPA are now in '/app/build/'



# Create executable image
FROM alpine:3.9
WORKDIR /app
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app/bin/kafka-owl /app/kafka-owl

COPY --from=frontendBuilder /app/build/ /app/build


# From: https://docs.docker.com/engine/reference/builder/#using-arg-variables
# We want to bake the commit sha into the image, or abort if the value is not set
# ENV values are persistet in the built image, ARG instructions are not!
ARG COMMIT_SHA
ENV COMMIT_SHA ${COMMIT_SHA}
RUN if [ -z "$COMMIT_SHA" ]; then echo 'Build argument "COMMIT_SHA" is missing.'; exit 1; fi


ENTRYPOINT ["./kafka-owl", \
    "--server.http.listen-port=9090", \
    "--serve-frontend=true", \
    ]
