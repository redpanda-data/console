package main

import (
	"github.com/kafka-owl/kafka-owl/pkg/api"
)

func main() {
	build := api.NewAPIBuilder()
	api := build.Build()
	api.Start()
}
