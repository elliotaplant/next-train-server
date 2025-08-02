import { z } from "zod";

// AC Transit API response schemas
const ACTransitRoute = z.object({
	RouteId: z.string(),
	Name: z.string(),
	Description: z.string().nullable(),
});

const ACTransitStop = z.object({
	StopId: z.number(),
	Name: z.string(),
	Latitude: z.number(),
	Longitude: z.number(),
	Scheduling: z.boolean().optional(),
	Order: z.number().optional(),
});

const ACTransitRouteStops = z.object({
	Route: z.string(),
	Direction: z.string(),
	Destination: z.string(),
	Stops: z.array(ACTransitStop),
});

// Directions API returns array of strings
const ACTransitDirections = z.array(z.string());

export class ACTransitDataImporter {
	private db: D1Database;
	private apiKey: string;
	private baseURL = "https://api.actransit.org/transit";

	constructor(db: D1Database, apiKey: string) {
		this.db = db;
		this.apiKey = apiKey;
	}

	async importAllData(): Promise<{
		routes: number;
		stops: number;
		directions: number;
		errors: string[];
	}> {
		const result = {
			routes: 0,
			stops: 0,
			directions: 0,
			errors: [] as string[],
		};

		try {
			// Get agency ID
			const agency = await this.db.prepare(
				"SELECT id FROM agencies WHERE code = 'actransit'"
			).first();
			
			if (!agency) {
				throw new Error("AC Transit agency not found in database");
			}
			
			const agencyId = agency.id as number;

			// Import all routes
			console.log("Fetching all AC Transit routes...");
			const routes = await this.fetchAllRoutes();
			result.routes = routes.length;
			
			for (const route of routes) {
				try {
					await this.importRoute(agencyId, route);
					
					// Skip directions and route stops for now - we'll use the general stops endpoint
					// This avoids hitting the API 130+ times and simplifies the import
				} catch (error) {
					console.error(`Error importing route ${route.RouteId}:`, error);
					result.errors.push(`Route ${route.RouteId}: ${error.message}`);
				}
			}

			// Skip importing all stops for now - it's too slow
			// We'll need to optimize this with batch inserts
			console.log("Skipping stops import for now...");

		} catch (error) {
			console.error("Import failed:", error);
			result.errors.push(`General error: ${error.message}`);
		}

		return result;
	}

	private async fetchAllRoutes() {
		const url = `${this.baseURL}/routes?token=${this.apiKey}`;
		const response = await fetch(url);
		
		if (!response.ok) {
			throw new Error(`Failed to fetch routes: ${response.status}`);
		}
		
		const data = await response.json();
		return z.array(ACTransitRoute).parse(data);
	}

	private async fetchAllStops() {
		const url = `${this.baseURL}/stops?token=${this.apiKey}`;
		const response = await fetch(url);
		
		if (!response.ok) {
			throw new Error(`Failed to fetch stops: ${response.status}`);
		}
		
		const data = await response.json();
		return z.array(ACTransitStop).parse(data);
	}

	private async fetchRouteStops(routeId: string) {
		const url = `${this.baseURL}/route/${encodeURIComponent(routeId)}/stops?token=${this.apiKey}`;
		const response = await fetch(url);
		
		if (!response.ok) {
			console.warn(`Failed to fetch stops for route ${routeId}: ${response.status}`);
			return [];
		}
		
		const data = await response.json();
		// This endpoint returns an array of route/direction/stops combinations
		const routeStops = z.array(ACTransitRouteStops).parse(data);
		
		// Extract all unique stops from all directions
		const stopsMap = new Map<number, z.infer<typeof ACTransitStop>>();
		for (const routeDirection of routeStops) {
			for (const stop of routeDirection.Stops) {
				stopsMap.set(stop.StopId, stop);
			}
		}
		
		return Array.from(stopsMap.values());
	}

	private async fetchRouteDirections(routeId: string) {
		const url = `${this.baseURL}/route/${routeId}/directions?token=${this.apiKey}`;
		const response = await fetch(url);
		
		if (!response.ok) {
			console.warn(`Failed to fetch directions for route ${routeId}: ${response.status}`);
			return [];
		}
		
		const data = await response.json();
		return ACTransitDirections.parse(data);
	}

	private async importRoute(agencyId: number, route: z.infer<typeof ACTransitRoute>) {
		await this.db.prepare(`
			INSERT INTO routes (agency_id, route_code, route_name, route_type, active)
			VALUES (?, ?, ?, 'bus', TRUE)
			ON CONFLICT(agency_id, route_code) 
			DO UPDATE SET 
				route_name = excluded.route_name,
				active = TRUE,
				updated_at = CURRENT_TIMESTAMP
		`).bind(
			agencyId,
			route.RouteId,
			route.Name || route.Description || route.RouteId
		).run();
	}

	private async importStop(agencyId: number, stop: z.infer<typeof ACTransitStop>) {
		await this.db.prepare(`
			INSERT INTO stops (agency_id, stop_code, stop_name, lat, lon, active)
			VALUES (?, ?, ?, ?, ?, TRUE)
			ON CONFLICT(agency_id, stop_code) 
			DO UPDATE SET 
				stop_name = excluded.stop_name,
				lat = excluded.lat,
				lon = excluded.lon,
				active = TRUE,
				updated_at = CURRENT_TIMESTAMP
		`).bind(
			agencyId,
			stop.StopId.toString(),
			stop.Name,
			stop.Latitude,
			stop.Longitude
		).run();
	}

	private async importDirection(routeId: string, direction: string) {
		// Get route database ID
		const route = await this.db.prepare(
			"SELECT id FROM routes WHERE route_code = ?"
		).bind(routeId).first();
		
		if (!route) {
			console.warn(`Route ${routeId} not found for direction ${direction.Direction}`);
			return;
		}

		// Check if direction already exists
		const existing = await this.db.prepare(
			"SELECT id FROM directions WHERE route_id = ? AND direction_code = ?"
		).bind(route.id, direction).first();

		if (existing) {
			// Update existing
			await this.db.prepare(`
				UPDATE directions SET 
					headsign = ?,
					active = TRUE,
					updated_at = CURRENT_TIMESTAMP
				WHERE id = ?
			`).bind(direction, existing.id).run();
		} else {
			// Insert new
			await this.db.prepare(`
				INSERT INTO directions (route_id, direction_code, headsign, active)
				VALUES (?, ?, ?, TRUE)
			`).bind(
				route.id,
				direction,
				direction // Use same value for code and headsign for now
			).run();
		}
	}

	private async linkStopToRoute(agencyId: number, routeCode: string, stopCode: string) {
		// Get IDs
		const route = await this.db.prepare(
			"SELECT id FROM routes WHERE agency_id = ? AND route_code = ?"
		).bind(agencyId, routeCode).first();
		
		const stop = await this.db.prepare(
			"SELECT id FROM stops WHERE agency_id = ? AND stop_code = ?"
		).bind(agencyId, stopCode).first();
		
		if (!route || !stop) {
			return;
		}

		// Insert link without direction for now (we'd need more data to properly link directions)
		await this.db.prepare(`
			INSERT INTO stop_routes (stop_id, route_id, active)
			VALUES (?, ?, TRUE)
			ON CONFLICT(stop_id, route_id, direction_id) 
			DO UPDATE SET 
				active = TRUE,
				created_at = CURRENT_TIMESTAMP
			WHERE direction_id IS NULL
		`).bind(stop.id, route.id).run();
	}
}