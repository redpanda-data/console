package main

import (
	"github.com/kafka-owl/kafka-owl/pkg/api"
)

func main() {
	build, _ := api.NewAPIBuilder()
	api := build.Build()
	api.Start()
}
