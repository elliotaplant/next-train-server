# NextTrain Server

A Cloudflare Worker that provides a backend API and web interface for the NextTrain transit app. It acts as an authenticated proxy for transit APIs, currently supporting AC Transit.

## Features

- **Transit API Proxy**: Authenticated proxy for AC Transit API
- **Web Interface**: Responsive web client for viewing real-time transit predictions
- **Favorites System**: Save and manage favorite stops with localStorage
- **Real-time Data**: All data fetched directly from transit APIs on-demand
- **Support Page**: Contact form with Cloudflare Email Routing integration

## Architecture

```
├── src/
│   ├── index.ts              # Main worker entry point
│   ├── endpoints/             # API endpoints
│   │   ├── routes.ts          # Routes for an agency
│   │   ├── stops.ts           # Stops for a route
│   │   ├── stopDirections.ts  # Directions for a stop
│   │   ├── transitPredictions.ts # Real-time predictions
│   │   └── supportEmail.ts    # Support form handler
│   ├── clients/
│   │   └── AcTransitClient.ts # AC Transit API client
│   └── types.ts               # TypeScript types
├── public/
│   ├── index.html             # Web client
│   └── support.html           # Support page
└── scripts/
    └── fetch.js              # curl replacement script
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

3. Set up secrets:
```bash
# For local development
echo "YOUR_AC_TRANSIT_API_KEY" | wrangler secret put AC_TRANSIT_API_KEY --local
echo "your-email@example.com" | wrangler secret put SUPPORT_EMAIL --local

# For production
wrangler secret put AC_TRANSIT_API_KEY
wrangler secret put SUPPORT_EMAIL
```

4. Start development server:
```bash
npm run dev
```

The server will be available at `http://localhost:8787`

## API Endpoints

### Transit Data

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

## Data Strategy

- **Real-time Data**: All data is fetched directly from transit APIs on-demand
- **No Caching**: Every request gets fresh data from the source API
- **Simple Architecture**: No database or cache layers to manage

## Environment Variables

Required secrets:
- `AC_TRANSIT_API_KEY`: API key for AC Transit
- `SUPPORT_EMAIL`: Email address for support requests

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