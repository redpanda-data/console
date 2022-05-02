// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package proto

import (
	"os"
	"os/signal"
	"syscall"
	"time"
)

func triggerRefresh(dur time.Duration, callback func()) {
	// Stop sync when we receive a signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	ticker := time.NewTicker(dur)
	for {
		select {
		case <-quit:
			return
		case <-ticker.C:
			callback()
		}
	}
}
