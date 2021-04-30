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
