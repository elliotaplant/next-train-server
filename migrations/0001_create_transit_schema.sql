-- Transit agencies
CREATE TABLE agencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,  -- e.g., 'actransit', 'bart'
    name TEXT NOT NULL,         -- e.g., 'AC Transit', 'BART'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Routes/Lines
CREATE TABLE routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agency_id INTEGER NOT NULL,
    route_code TEXT NOT NULL,   -- e.g., 'NL', '1', '51B'
    route_name TEXT,            -- e.g., 'Transbay Night Line'
    route_type TEXT,            -- e.g., 'bus', 'rail', 'ferry'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id),
    UNIQUE(agency_id, route_code)
);

-- Stops
CREATE TABLE stops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agency_id INTEGER NOT NULL,
    stop_code TEXT NOT NULL,    -- e.g., '55558', '50030'
    stop_name TEXT NOT NULL,    -- e.g., 'Uptown Transit Center'
    lat REAL,
    lon REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agency_id) REFERENCES agencies(id),
    UNIQUE(agency_id, stop_code)
);

-- Directions (headsigns/destinations)
CREATE TABLE directions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id INTEGER NOT NULL,
    direction_code TEXT,        -- e.g., 'To SF', 'To Eastmont'
    headsign TEXT,              -- e.g., 'San Francisco', 'Eastmont Transit Center'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (route_id) REFERENCES routes(id)
);

-- Many-to-many relationship between stops and routes
CREATE TABLE stop_routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stop_id INTEGER NOT NULL,
    route_id INTEGER NOT NULL,
    direction_id INTEGER,
    stop_sequence INTEGER,      -- Order of stop on this route
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stop_id) REFERENCES stops(id),
    FOREIGN KEY (route_id) REFERENCES routes(id),
    FOREIGN KEY (direction_id) REFERENCES directions(id),
    UNIQUE(stop_id, route_id, direction_id)
);

-- Indexes for performance
CREATE INDEX idx_routes_agency ON routes(agency_id);
CREATE INDEX idx_stops_agency ON stops(agency_id);
CREATE INDEX idx_directions_route ON directions(route_id);
CREATE INDEX idx_stop_routes_stop ON stop_routes(stop_id);
CREATE INDEX idx_stop_routes_route ON stop_routes(route_id);