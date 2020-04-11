# Backend Build
FROM golang:1.14-alpine as builder
RUN apk update && apk add --no-cache git ca-certificates && update-ca-certificates

WORKDIR /app

COPY ./backend/go.mod .
COPY ./backend/go.sum .
RUN go mod download

COPY ./backend .
RUN CGO_ENABLED=0 go build -o ./bin/kowl ./cmd/api
# Compiled backend binary is in '/app/bin/' named 'kowl'


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
FROM alpine:3
WORKDIR /app
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app/bin/kowl /app/kowl

COPY --from=frontendBuilder /app/build/ /app/build



# From: https://docs.docker.com/engine/reference/builder/#using-arg-variables
# We want to bake the commit sha into the image, or abort if the value is not set
# ENV values are persistet in the built image, ARG instructions are not!

# git sha of the commit
ARG GIT_SHA
RUN test -n "$GIT_SHA" || (echo "GIT_SHA must be set" && false)
ENV REACT_APP_GIT_SHA ${GIT_SHA}

# name of the git branch
ARG GIT_REF
RUN test -n "$GIT_REF" || (echo "GIT_REF must be set" && false)
ENV REACT_APP_GIT_REF ${GIT_REF}

# timestamp in unix seconds when the image was built
ARG TIMESTAMP
RUN test -n "$TIMESTAMP" || (echo "TIMESTAMP must be set" && false)
ENV REACT_APP_TIMESTAMP ${TIMESTAMP}


ENTRYPOINT ["./kowl"]
