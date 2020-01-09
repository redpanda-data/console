package owl

import (
	"flag"

	"github.com/cloudhut/common/flagext"
)

// Config holds all (subdependency)Configs needed to run the API
type Config struct {
	TopicsBlacklist flagext.StringsSlice
}

// RegisterFlags for all (sub)configs
func (c *Config) RegisterFlags(f *flag.FlagSet) {
	f.Var(&c.TopicsBlacklist, "owl.topics.blacklist", "Topics blacklist (comma separated) to configure access restrictions")
}
