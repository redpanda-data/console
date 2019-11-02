package main

import (
	"flag"

	"github.com/kafka-owl/kafka-owl/pkg/api"
	"github.com/kafka-owl/kafka-owl/pkg/common/flagext"
)

func main() {

	cfg := &api.Config{}
	flagext.RegisterFlags(cfg)
	flag.Parse()

	build := api.NewAPIBuilder(cfg)
	api := build.Build()
	api.Start()
}
