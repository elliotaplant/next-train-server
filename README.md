# NextTrain Server

A Cloudflare Worker that provides a backend API and web interface for the NextTrain transit app. It acts as an authenticated proxy and cache for transit APIs, currently supporting AC Transit.

## Features

- **Transit API Proxy**: Authenticated proxy for AC Transit API with intelligent caching
- **Web Interface**: Responsive web client for viewing real-time transit predictions
- **Favorites System**: Save and manage favorite stops with localStorage
- **Smart Caching**: 24-hour cache for metadata, 10-second cache for predictions, with stale-while-error fallback
- **Support Page**: Contact form with Cloudflare Email Routing integration
- **Database Storage**: D1 database for caching transit metadata (agencies, routes, stops, directions)

## Architecture

```
├── src/
│   ├── index.ts              # Main worker entry point
│   ├── endpoints/             # API endpoints
│   │   ├── agencies.ts        # List transit agencies
│   │   ├── routes.ts          # Routes for an agency
│   │   ├── stops.ts           # Stops for a route
│   │   ├── stopDirections.ts  # Directions for a stop
│   │   ├── transitPredictions.ts # Real-time predictions
│   │   └── support.ts         # Support form handler
│   ├── clients/
│   │   └── AcTransitClient.ts # AC Transit API client
│   └── types.ts               # TypeScript types
├── public/
│   ├── index.html             # Web client
│   └── support.html           # Support page
└── schema.sql                 # D1 database schema
```

## Local Development

### Prerequisites

- Node.js 18+
- npm or yarn
- Cloudflare account
- Wrangler CLI (`npm install -g wrangler`)

### Setup

1. Clone the repository:
```bash
git clone https://github.com/elliotaplant/next-train-server.git
cd next-train-server
```

2. Install dependencies:
```bash
npm install
```

3. Create D1 database:
```bash
wrangler d1 create next-train-db
```

4. Update `wrangler.toml` with your database ID:
```toml
[[d1_databases]]
binding = "DB"
database_name = "next-train-db"
database_id = "YOUR_DATABASE_ID"
```

5. Initialize database schema:
```bash
wrangler d1 execute next-train-db --local --file=./schema.sql
```

6. Set up secrets:
```bash
# For local development
echo "YOUR_AC_TRANSIT_API_KEY" | wrangler secret put AC_TRANSIT_API_KEY --local
echo "your-email@example.com" | wrangler secret put SUPPORT_EMAIL --local

# For production
wrangler secret put AC_TRANSIT_API_KEY
wrangler secret put SUPPORT_EMAIL
```

7. Start development server:
```bash
npm run dev
```

The server will be available at `http://localhost:8787`

## API Endpoints

### Transit Data

- `GET /api/transit/agencies` - List all agencies
- `GET /api/transit/routes?agency={code}` - Routes for an agency
- `GET /api/transit/stops?agency={code}&route={code}` - Stops for a route
- `GET /api/transit/stop-directions?agency={code}&route={code}&stop={code}` - Directions for a stop
- `GET /api/transit/predictions?agency={code}&stop={id}&route={code}` - Real-time predictions

### Support

- `POST /api/support` - Submit support request


## Deployment

1. Build and deploy to Cloudflare:
```bash
npm run deploy
```

2. Initialize production database (if not already done):
```bash
wrangler d1 execute next-train-db --file=./migrations/0001_create_transit_schema.sql
```

Note: The database will auto-populate with transit data as users access different routes.

## Caching Strategy

- **Routes & Stops**: Cached in D1 for 24 hours, serves stale data on API failure
- **Predictions**: Cached using Cache API for 10 seconds
- **Response Flags**: All cached responses include metadata:
  ```json
  {
    "cache": {
      "cached": true,
      "fresh": false
    }
  }
  ```

## Environment Variables

Required secrets:
- `AC_TRANSIT_API_KEY`: API key for AC Transit
- `SUPPORT_EMAIL`: Email address for support requests

D1 Database binding:
- `DB`: D1 database instance

## Web Client Features

- Progressive data loading (agency → route → stop → direction)
- Real-time predictions with auto-refresh (30 seconds)
- Favorites stored in localStorage
- Responsive design for mobile and desktop
- Visual indicators for inactive stops/routes

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally with `npm run dev`
5. Submit a pull request

## License

MIT

## Support

For issues or questions, use the support form at `/support` or open an issue on GitHub.