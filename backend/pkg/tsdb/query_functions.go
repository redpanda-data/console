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

// scaleDown reduces the number of datapoints so that it can be processed by the chart library in the frontend.
// To do so it tries to remove data points until it reaches the number of desired datapoints.
func scaleDown(dps []*tstorage.DataPoint, limit int) []*tstorage.DataPoint {
	if len(dps) < limit {
		return dps
	}
	maxDistance := 1 * time.Minute

	startTs := dps[0].Timestamp
	endTs := dps[len(dps)-1].Timestamp

	// Find the closest datapoint for each ts, so that we will end up with datapoints distributed along our time axis
	// as good as possible without interpolating the datapoints.
	lastUsedIdx := 0
	distributedTimestamps := createTimestamps(startTs, endTs, limit)
	res := make([]*tstorage.DataPoint, 0, limit)
	for _, ts := range distributedTimestamps {
		// If this desired timestamp is already after the current datapoint's timestamp, we can be sure that
		// this will be the best datapoint as upcoming datapoints can only be further away than the current datapoint.
		if ts <= dps[lastUsedIdx].Timestamp {
			if isTimestampInRange(ts, dps[lastUsedIdx].Timestamp, maxDistance) {
				res = append(res, dps[lastUsedIdx])
			}
			continue
		}

		// Check if the next datapoint's timestamp is closer to our target
		closest := dps[lastUsedIdx]
		currentDiff := abs(closest.Timestamp - ts)
		for j := lastUsedIdx + 1; j < len(dps); j++ {
			jDiff := abs(dps[j].Timestamp - ts)
			if jDiff < currentDiff {
				closest = dps[j]
				currentDiff = jDiff
				lastUsedIdx++
				continue
			}
			// It could only become worse after this, because the datapoints are ordered strictly chronologically
			break
		}
		if isTimestampInRange(ts, closest.Timestamp, maxDistance) {
			res = append(res, closest)
		}
	}

	return res
}

func isTimestampInRange(a, b int64, dist time.Duration) bool {
	diff := abs(a - b)
	if diff > int64(dist.Seconds()) {
		// The diff between point a and b is too large. The timestamp is not in range
		return false
	}
	return true
}

// createTimestamps is a helper function that creates numbers with the same distance to each other within the
// boundary from start to end.
// The start and end number have to be the first/last number in the returned slice.
// Count has to be at least 2.
func createTimestamps(start, end int64, count int) []int64 {
	timestamps := make([]int64, count)

	timestamps[0] = start
	previousTs := start
	for i := 1; i < count; i++ {
		if previousTs > end {
			// If this iteration timestamp is higher than the end timestamp we will not find any dps anymore.
			break
		}

		toFind := count - i
		stepSize := (end - previousTs) / int64(toFind)
		newTs := previousTs + stepSize
		timestamps[i] = newTs
		previousTs = newTs
	}

	return timestamps
}

func abs(x int64) int64 {
	if x < 0 {
		return -x
	}
	return x
}
