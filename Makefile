IMAGE_NAME  ?= redpanda-console
TAG         ?= 2.8.2

FORKED_CONSOLE_DIR ?= ./redpanda-console

.PHONY: all build test run

all: build

## Build the Docker image
build:
	docker build -t $(IMAGE_NAME):$(TAG)	.

## Run the container locally for quick testing
run:
	docker run --rm -p 8080:8080 -e KAFKA_BROKERS=b-1.dev-rep1.xqjb5v.c2.kafka.us-east-1.amazonaws.com -it $(IMAGE_NAME):$(TAG)

test:
	cd $(FORKED_CONSOLE_DIR) && go test ./... -v
