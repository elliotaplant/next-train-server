-- Insert AC Transit agency
INSERT INTO agencies (code, name) VALUES ('actransit', 'AC Transit');

-- Insert NL route
INSERT INTO routes (agency_id, route_code, route_name, route_type)
SELECT id, 'NL', 'Transbay Night Line', 'bus'
FROM agencies WHERE code = 'actransit';

-- Insert stops
INSERT INTO stops (agency_id, stop_code, stop_name)
SELECT id, '55558', 'Uptown Transit Center'
FROM agencies WHERE code = 'actransit';

INSERT INTO stops (agency_id, stop_code, stop_name)
SELECT id, '50030', 'Salesforce Transit Center Bay 30'
FROM agencies WHERE code = 'actransit';

-- Insert directions for NL route
INSERT INTO directions (route_id, direction_code, headsign)
SELECT id, 'To San Francisco', 'San Francisco'
FROM routes WHERE route_code = 'NL' AND agency_id = (SELECT id FROM agencies WHERE code = 'actransit');

INSERT INTO directions (route_id, direction_code, headsign)
SELECT id, 'To Eastmont Transit Center', 'Eastmont Transit Center'
FROM routes WHERE route_code = 'NL' AND agency_id = (SELECT id FROM agencies WHERE code = 'actransit');

-- Link stops to routes with directions
-- Uptown Transit Center serves NL To San Francisco
INSERT INTO stop_routes (stop_id, route_id, direction_id)
SELECT 
    s.id,
    r.id,
    d.id
FROM stops s
CROSS JOIN routes r
CROSS JOIN directions d
WHERE s.stop_code = '55558'
    AND r.route_code = 'NL'
    AND d.direction_code = 'To San Francisco';

-- Salesforce Transit Center serves both directions
INSERT INTO stop_routes (stop_id, route_id, direction_id)
SELECT 
    s.id,
    r.id,
    d.id
FROM stops s
CROSS JOIN routes r
CROSS JOIN directions d
WHERE s.stop_code = '50030'
    AND r.route_code = 'NL';