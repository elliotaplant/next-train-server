# NextTrain Server - Claude Code Instructions

## Project Overview

This is a Cloudflare Worker that serves as the backend for the NextTrain iOS app and web client. It proxies and caches transit API requests, stores metadata in a D1 database, and provides a web interface for viewing real-time transit predictions.

## Key Architecture Decisions

### Caching Strategy
- **Metadata (routes, stops)**: Cached in D1 database for 24 hours
- **Predictions**: Cached using Cloudflare Cache API for 10 seconds
- **Stale-while-error**: Serves stale data if API fails after cache expires
- **Cache flags**: All responses include `cache: { cached: boolean, fresh: boolean }`

### Stop Deduplication
Some stops have multiple IDs for the same physical location (different platforms/directions). We handle this by:
1. Consolidating duplicate stop names with comma-separated IDs
2. The `stopDirections` endpoint returns which specific stop ID to use for each direction
3. Example: "103rd Avenue" might have IDs "51234,51235" consolidated

### Active Status
The `active` field is **server-determined** based on whether predictions are available. Don't let clients set this value - it should be determined by checking if the API returns predictions.

## Common Tasks

### Testing Locally
```bash
npm run dev
# Server runs on http://localhost:8787
# Test endpoints:
curl http://localhost:8787/api/transit/predictions?agency=actransit&stop=55558&route=NL
```

### Deployment
```bash
npm run deploy
```

### Database Operations
```bash
# Local database
wrangler d1 execute next-train-db --local --file=./schema.sql

# Production database  
wrangler d1 execute next-train-db --file=./schema.sql

# Query local database
wrangler d1 execute next-train-db --local --command "SELECT * FROM routes WHERE route_code='NL'"
```

### Data Population
Routes and stops are fetched on-demand from the AC Transit API when:
1. They're accessed for the first time
2. The cached data is older than 24 hours

No manual sync is needed - the system self-populates.

## Important Files

- `src/endpoints/transitPredictions.ts` - Real-time predictions with 10s cache
- `src/endpoints/routes.ts` - Routes with 24hr cache and stale-while-error
- `src/endpoints/stops.ts` - Stops with deduplication logic
- `src/endpoints/stopDirections.ts` - Direction-specific stop IDs
- `src/clients/AcTransitClient.ts` - AC Transit API integration with timezone handling
- `public/index.html` - Web client with favorites system

## Known Issues & Solutions

### Issue: Duplicate Stop Names
**Solution**: Stops with same name are consolidated with comma-separated IDs. The `stopDirections` endpoint tells which ID to use for each direction.

### Issue: Timezone Conversion
**Solution**: AC Transit returns times in Pacific Time. The `AcTransitClient` handles DST correctly when converting to UTC.

### Issue: "Loading predictions..." persists
**Solution**: Don't call `renderFavorites()` after updating predictions. Update warnings separately without re-rendering.

### Issue: Inactive warnings showing during load
**Solution**: Default `active: true` for new favorites, only set to `false` when server confirms no predictions.

## API Key Management

```bash
# Set AC Transit API key locally
echo "YOUR_KEY" | wrangler secret put AC_TRANSIT_API_KEY --local

# Set for production
wrangler secret put AC_TRANSIT_API_KEY
```

## Database Schema

Key tables:
- `agencies` - Transit agencies (currently just AC Transit)
- `routes` - Bus/train routes with 24hr cache via `updated_at`
- `stops` - Physical stops with coordinates
- `directions` - Route directions (e.g., "To San Francisco")
- `stop_routes` - Junction table linking stops, routes, and directions

## Testing Specific Stops

Common test cases:
```bash
# Uptown Transit Center - NL route
curl "http://localhost:8787/api/transit/predictions?agency=actransit&stop=55558&route=NL"

# Salesforce Transit Center - NL route  
curl "http://localhost:8787/api/transit/predictions?agency=actransit&stop=50030&route=NL"
```

## Debugging Tips

1. Check server logs: Ask user to provide logs when testing locally
2. Database state: Use `wrangler d1 execute` to inspect data
3. Cache behavior: Check `cache` field in API responses
4. Stop IDs: Verify comma-separated IDs are handled correctly

## Future Improvements

- Add support for other transit agencies (BART, Muni, etc.)
- Implement user accounts for syncing favorites
- Add route planning/trip suggestions
- Push notifications for arrival times
- Real-time vehicle tracking on map