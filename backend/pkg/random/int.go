package random

import "math/rand"

// IntInRange returns a random number in the range between lo and hi.
func IntInRange(low, hi int) int {
	return low + rand.Intn(hi-low)
}
