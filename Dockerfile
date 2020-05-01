############################################################
# Backend Build
############################################################
FROM golang:1.14-alpine as builder
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
FROM node:12-alpine as frontendBuilder

WORKDIR /app
ENV PATH /app/node_modules/.bin:$PATH

COPY ./frontend/package.json ./package.json
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

COPY ./frontend ./
RUN npm run build
# All the built frontend files for the SPA are now in '/app/build/'


############################################################
# Final Image
############################################################
FROM alpine:3

# Embed env vars in final image as well (so the backend can read them)
ARG KOWL_GIT_SHA
ENV KOWL_GIT_SHA ${KOWL_GIT_SHA}
ENV REACT_APP_KOWL_GIT_SHA ${KOWL_GIT_SHA}

ARG KOWL_GIT_REF
ENV KOWL_GIT_REF ${KOWL_GIT_REF}
ENV REACT_APP_KOWL_GIT_REF ${KOWL_GIT_REF}

ARG KOWL_TIMESTAMP
ENV KOWL_TIMESTAMP ${KOWL_TIMESTAMP}
ENV REACT_APP_KOWL_TIMESTAMP ${KOWL_TIMESTAMP}

WORKDIR /app

RUN echo $REACT_APP_KOWL_GIT_SHA >> sha.envVar; \
    echo $REACT_APP_KOWL_GIT_REF >> ref.envVar; \
    echo $REACT_APP_KOWL_TIMESTAMP >> time.envVar

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app/bin/kowl /app/kowl

COPY --from=frontendBuilder /app/build/ /app/build

ENTRYPOINT ["./kowl"]
