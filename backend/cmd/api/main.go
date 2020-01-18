package main

import (
	"flag"

	"github.com/cloudhut/common/flagext"
	"github.com/cloudhut/kafka-owl/backend/pkg/api"
)

func main() {

	cfg := &api.Config{}
	flagext.RegisterFlags(cfg)
	flag.Parse()

	api := api.New(cfg)
	api.Start()
}
