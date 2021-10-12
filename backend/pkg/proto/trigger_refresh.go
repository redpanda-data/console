package proto

import (
	"context"
	"time"
)

func triggerRefresh(ctx context.Context, dur time.Duration, callback func()) {
	ticker := time.NewTicker(dur)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			callback()
		}
	}
}
