-- Since we can't drop constraints in SQLite, we need to recreate the table
-- But for now, let's just add an ON CONFLICT clause in our insert statements

-- Create additional indexes for performance
CREATE INDEX IF NOT EXISTS idx_routes_code ON routes(route_code);
CREATE INDEX IF NOT EXISTS idx_stops_code ON stops(stop_code);
CREATE INDEX IF NOT EXISTS idx_stop_routes_stop_route ON stop_routes(stop_id, route_id);