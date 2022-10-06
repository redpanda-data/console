// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package main

import (
	"github.com/redpanda-data/console/backend/pkg/config"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/api"
)

func main() {
	startupLogger := zap.NewExample()

	cfg, err := config.LoadConfig(startupLogger)
	if err != nil {
		startupLogger.Fatal("failed to load config", zap.Error(err))
	}
	err = cfg.Validate()
	if err != nil {
		startupLogger.Fatal("failed to validate config", zap.Error(err))
	}

	a := api.New(&cfg)
	a.Start()
}
