package tsdb

import (
	"github.com/nakabonne/tstorage"
	"math"
	"time"
)

// Rate calculates the per-second rate on gauges. Therefore, it only considers positive delta changes.
func rate(dps []*tstorage.DataPoint, rateDur time.Duration) []*tstorage.DataPoint {
	// No sense in trying to compute a rate without at least two points
	if len(dps) < 2 {
		return nil
	}

	res := make([]*tstorage.DataPoint, 0, len(dps))
	// For each given datapoint we'd like to calc the per-second rate of the proceeding rateDur
	for i, dp := range dps {
		// Calculate the per second rate for each moving window of size "rateDur"
		// Thus let's find the right end point for each start point within the rateDur boundary
		// Example: Startpoint is at timestamp 1000, rateDur = 30s then we want to cosnsider all points
		// between timestamp 1000 and 1030
		start := dp

		var accumulatedPositiveDeltas float64
		var accumulatedTimeDeltas float64 // Only time deltas of positive datapoint deltas will be considered
		upperBoundary := time.Unix(start.Timestamp, 0).Add(rateDur)
		for j := i + 1; j < len(dps); j++ {
			if dps[j].Timestamp > upperBoundary.Unix() {
				break
			}

			previousValue := dps[j-1].Value
			if dps[j].Value < previousValue {
				// This value is lower than the previous one. This may be a counter reset or some other reason
				// for a drop which we want to ignore in that case
				continue
			}

			accumulatedPositiveDeltas += dps[j].Value - previousValue
			accumulatedTimeDeltas += float64(dps[j].Timestamp - dps[j-1].Timestamp)
		}

		var perSecondAvg float64
		if accumulatedTimeDeltas == 0 {
			// If we don't have at least two positive deltas, we can return NaN.
			perSecondAvg = math.NaN()
		} else if accumulatedPositiveDeltas == 0 {
			// We have at least two valid datapoints, but value doesn't seem to change
			perSecondAvg = 0
		} else {
			perSecondAvg = accumulatedPositiveDeltas / accumulatedTimeDeltas
		}

		res = append(res, &tstorage.DataPoint{
			Value:     perSecondAvg,
			Timestamp: start.Timestamp,
		})
	}

	return res
}
