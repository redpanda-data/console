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

	ServeFrontend    bool
	CompressionLevel int
}

// RegisterFlags adds the flags required to config the server
func (c *Config) RegisterFlags(f *flag.FlagSet) {
	f.DurationVar(&c.ServerGracefulShutdownTimeout, "server.graceful-shutdown-timeout", 30*time.Second, "Timeout for graceful shutdowns")

	f.IntVar(&c.HTTPListenPort, "server.http.listen-port", 80, "HTTP server listen port")
	f.DurationVar(&c.HTTPServerReadTimeout, "server.http.read-timeout", 30*time.Second, "Read timeout for HTTP server")
	f.DurationVar(&c.HTTPServerWriteTimeout, "server.http.write-timeout", 30*time.Second, "Write timeout for HTTP server")
	f.DurationVar(&c.HTTPServerIdleTimeout, "server.http.idle-timeout", 120*time.Second, "Idle timeout for HTTP server")

	f.BoolVar(&c.ServeFrontend, "server.serve-frontend", true, "Whether or not to serve the static frontend files from './build'. If false, only '/api/' routes will work. Setting this to false is only intended for debugging/development!")
	f.IntVar(&c.CompressionLevel, "server.compression-level", 4, "Compression level applied to all http responses. Valid values are: 0-9 (0=completely disable compression middleware, 1=weakest compression, 9=best compression)")

}
