package rest

import (
	"flag"
	"time"
)

// Config for a HTTP server
type Config struct {
	ServerGracefulShutdownTimeout time.Duration

	HTTPListenPort         int
	HTTPServerReadTimeout  time.Duration
	HTTPServerWriteTimeout time.Duration
	HTTPServerIdleTimeout  time.Duration
}

// RegisterFlags adds the flags required to config the server
func (cfg *Config) RegisterFlags(f *flag.FlagSet) {
	f.DurationVar(&cfg.ServerGracefulShutdownTimeout, "server.graceful-shutdown-timeout", 30*time.Second, "Timeout for graceful shutdowns")

	f.IntVar(&cfg.HTTPListenPort, "server.http.listen-port", 80, "HTTP server listen port")
	f.DurationVar(&cfg.HTTPServerReadTimeout, "server.http.read-timeout", 30*time.Second, "Read timeout for HTTP server")
	f.DurationVar(&cfg.HTTPServerWriteTimeout, "server.http.write-timeout", 30*time.Second, "Write timeout for HTTP server")
	f.DurationVar(&cfg.HTTPServerIdleTimeout, "server.http.idle-timeout", 120*time.Second, "Idle timeout for HTTP server")
}
