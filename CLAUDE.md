# NextTrain Server - Claude Code Instructions

## Project Overview

This is a Cloudflare Worker that serves as the backend for the NextTrain iOS app and web client. It proxies transit API requests and provides a web interface for viewing real-time transit predictions.

## Key Architecture Decisions

### API Strategy
- **Direct API calls**: All data is fetched directly from transit APIs on-demand
- **No caching**: Responses are always fresh from the source APIs
- **Simple architecture**: No database or cache layers to manage

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
node scripts/fetch.js http://localhost:8787/api/transit/predictions?agency=actransit&stop=55558&route=NL
```

### Deployment
```bash
npm run deploy
```

## Important Files

- `src/endpoints/transitPredictions.ts` - Real-time predictions
- `src/endpoints/routes.ts` - Routes fetched from AC Transit API
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

## Note on curl
Do not use `curl`.
Instead, use `node scripts/fetch.js`.
It is exactly the same from a usage standpoint, but has security wrapping for usage with claude-code.

## Testing Specific Stops

Common test cases:
```bash
# Uptown Transit Center - NL route
node scripts/fetch.js "http://localhost:8787/api/transit/predictions?agency=actransit&stop=55558&route=NL"

# Salesforce Transit Center - NL route  
node scripts/fetch.js "http://localhost:8787/api/transit/predictions?agency=actransit&stop=50030&route=NL"
```

## Debugging Tips

1. Check server logs: Ask user to provide logs when testing locally
2. API responses: All data comes directly from transit APIs
3. Stop IDs: Verify comma-separated IDs are handled correctly

## Future Improvements

- Add support for other transit agencies (BART, Muni, etc.)
- Implement user accounts for syncing favorites
- Add route planning/trip suggestions
- Push notifications for arrival times
- Real-time vehicle tracking on map

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.