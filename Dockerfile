############################################################
# Backend Build
############################################################
FROM golang:1.17.8-alpine as builder
RUN apk update && apk add --no-cache git ca-certificates && update-ca-certificates

WORKDIR /app

COPY ./backend/go.mod .
COPY ./backend/go.sum .
RUN go mod download

COPY ./backend .
RUN CGO_ENABLED=0 go build -o ./bin/kowl ./cmd/api
# Compiled backend binary is in '/app/bin/' named 'kowl'


############################################################
# Frontend Build
############################################################
FROM node:16.3.0-alpine as frontendBuilder

WORKDIR /app
ENV PATH /app/node_modules/.bin:$PATH

COPY ./frontend/package.json ./package.json
COPY ./frontend/package-lock.json ./package-lock.json
RUN npm install


# From: https://docs.docker.com/engine/reference/builder/#using-arg-variables
# We want to bake the envVars into the image (and react app), or abort if they're not set
# ENV values are persistet in the built image, ARG instructions are not!

# git sha of the commit
ARG KOWL_GIT_SHA
RUN test -n "$KOWL_GIT_SHA" || (echo "KOWL_GIT_SHA must be set" && false)
ENV REACT_APP_KOWL_GIT_SHA ${KOWL_GIT_SHA}

# name of the git branch
ARG KOWL_GIT_REF
RUN test -n "$KOWL_GIT_REF" || (echo "KOWL_GIT_REF must be set" && false)
ENV REACT_APP_KOWL_GIT_REF ${KOWL_GIT_REF}

# timestamp in unix seconds when the image was built
ARG KOWL_TIMESTAMP
RUN test -n "$KOWL_TIMESTAMP" || (echo "KOWL_TIMESTAMP must be set" && false)
ENV REACT_APP_KOWL_TIMESTAMP ${KOWL_TIMESTAMP}

# whether the image was build in response to a push (as opposed to an intentional "release")
ARG BUILT_FROM_PUSH
ENV REACT_APP_BUILT_FROM_PUSH ${BUILT_FROM_PUSH}

COPY ./frontend ./
RUN npm run build
# All the built frontend files for the SPA are now in '/app/build/'


############################################################
# Final Image
############################################################
FROM alpine:3

# Embed env vars in final image as well (so the backend can read them)
ARG KOWL_GIT_SHA
ENV REACT_APP_KOWL_GIT_SHA ${KOWL_GIT_SHA}

ARG KOWL_GIT_REF
ENV REACT_APP_KOWL_GIT_REF ${KOWL_GIT_REF}

ARG KOWL_TIMESTAMP
ENV REACT_APP_KOWL_TIMESTAMP ${KOWL_TIMESTAMP}

WORKDIR /app

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app/bin/kowl /app/kowl

COPY --from=frontendBuilder /app/build/ /app/build

# Add github.com to known SSH hosts by default (required for pulling topic docs & proto files from a Git repo)
RUN apk update && apk add --no-cache openssh
RUN ssh-keyscan github.com >> /etc/ssh/ssh_known_hosts

ENTRYPOINT ["./kowl"]
