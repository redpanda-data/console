package main

import (
	"flag"

	"github.com/kafka-owl/common/flagext"
	"github.com/kafka-owl/kafka-owl/pkg/api"
)

func main() {

	cfg := &api.Config{}
	flagext.RegisterFlags(cfg)
	flag.Parse()

	api := api.New(cfg)
	api.Start()
}
