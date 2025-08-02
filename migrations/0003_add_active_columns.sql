-- Add active column to agencies
ALTER TABLE agencies ADD COLUMN active BOOLEAN DEFAULT TRUE;

-- Add active column to routes
ALTER TABLE routes ADD COLUMN active BOOLEAN DEFAULT TRUE;

-- Add active column to stops
ALTER TABLE stops ADD COLUMN active BOOLEAN DEFAULT TRUE;

-- Add active column to directions
ALTER TABLE directions ADD COLUMN active BOOLEAN DEFAULT TRUE;

-- Add active column to stop_routes
ALTER TABLE stop_routes ADD COLUMN active BOOLEAN DEFAULT TRUE;

-- Create indexes for active columns
CREATE INDEX idx_agencies_active ON agencies(active);
CREATE INDEX idx_routes_active ON routes(active);
CREATE INDEX idx_stops_active ON stops(active);
CREATE INDEX idx_directions_active ON directions(active);
CREATE INDEX idx_stop_routes_active ON stop_routes(active);