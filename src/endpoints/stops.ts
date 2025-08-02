import { Bool, OpenAPIRoute, Str, Query } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types";

export class Stops extends OpenAPIRoute {
	schema = {
		tags: ["Transit"],
		summary: "Get stops for a specific route",
		request: {
			query: z.object({
				agency: Str({ description: "Transit agency code", example: "actransit" }),
				route: Str({ description: "Route code", example: "NL" }),
			}),
		},
		responses: {
			"200": {
				description: "Stops retrieved successfully",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							agency: Str(),
							route: Str(),
							stops: z.array(z.object({
								stopId: Str(),
								stopCode: Str(),
								stopName: Str(),
								lat: z.number().nullable(),
								lon: z.number().nullable(),
							})),
						}),
					},
				},
			},
			"400": {
				description: "Invalid parameters",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							error: Str(),
						}),
					},
				},
			},
			"404": {
				description: "Route not found",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							error: Str(),
						}),
					},
				},
			},
			"500": {
				description: "Server error",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							error: Str(),
						}),
					},
				},
			},
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { agency, route } = data.query;

		try {
			// First check if we have cached stops
			const cachedStops = await this.getCachedStops(c.env.DB, agency, route);
			
			if (cachedStops.length > 0) {
				return {
					success: true,
					agency,
					route,
					stops: cachedStops,
				};
			}

			// If not cached, fetch from AC Transit API
			if (agency !== "actransit") {
				return Response.json(
					{
						success: false,
						error: "Only AC Transit is currently supported",
					},
					{ status: 400 }
				);
			}

			// Fetch stops from AC Transit API
			const url = `https://api.actransit.org/transit/route/${encodeURIComponent(route)}/stops?token=${c.env.AC_TRANSIT_API_KEY}`;
			const response = await fetch(url);

			if (!response.ok) {
				if (response.status === 404) {
					return Response.json(
						{
							success: false,
							error: `Route ${route} not found`,
						},
						{ status: 404 }
					);
				}
				throw new Error(`AC Transit API error: ${response.status}`);
			}

			const routeStopsData = await response.json();

			// Extract unique stop NAMES (not IDs) across all directions
			// Group stops by name to handle cases where one location has multiple IDs
			const stopsByName = new Map();
			
			for (const routeDirection of routeStopsData) {
				for (const stop of routeDirection.Stops) {
					const stopName = stop.Name;
					if (!stopsByName.has(stopName)) {
						stopsByName.set(stopName, []);
					}
					stopsByName.get(stopName).push({
						stopId: stop.StopId.toString(),
						stopCode: stop.StopId.toString(),
						stopName: stop.Name,
						lat: stop.Latitude,
						lon: stop.Longitude,
						direction: routeDirection.Direction,
					});
				}
			}
			
			// Create one entry per unique stop name
			// For stops with multiple IDs, we'll use a comma-separated list of IDs
			const stops = Array.from(stopsByName.entries()).map(([name, stopList]) => {
				if (stopList.length === 1) {
					// Single stop ID for this name
					return {
						stopId: stopList[0].stopId,
						stopCode: stopList[0].stopCode,
						stopName: stopList[0].stopName,
						lat: stopList[0].lat,
						lon: stopList[0].lon,
					};
				} else {
					// Multiple stop IDs for this name - combine them
					// Use the first stop's coordinates (they should be very close)
					return {
						stopId: stopList.map(s => s.stopId).join(','),
						stopCode: stopList.map(s => s.stopCode).join(','),
						stopName: name,
						lat: stopList[0].lat,
						lon: stopList[0].lon,
					};
				}
			}).sort((a, b) => a.stopName.localeCompare(b.stopName));

			// Cache the data asynchronously
			c.executionCtx.waitUntil(this.cacheStopsData(c.env.DB, agency, route, routeStopsData));

			return {
				success: true,
				agency,
				route,
				stops,
			};
		} catch (error) {
			console.error("Stops error:", error);
			return Response.json(
				{
					success: false,
					error: error instanceof Error ? error.message : "Failed to fetch stops",
				},
				{ status: 500 }
			);
		}
	}

	private async getCachedStops(db: D1Database, agencyCode: string, routeCode: string) {
		try {
			const result = await db.prepare(`
				SELECT DISTINCT 
					s.stop_code as stopCode,
					s.stop_name as stopName,
					s.lat,
					s.lon
				FROM stops s
				JOIN agencies a ON s.agency_id = a.id
				JOIN stop_routes sr ON s.id = sr.stop_id
				JOIN routes r ON sr.route_id = r.id
				WHERE a.code = ? AND r.route_code = ? AND s.active = TRUE
				ORDER BY s.stop_name
			`).bind(agencyCode, routeCode).all();

			if (!result.results || result.results.length === 0) {
				return [];
			}

			// Group stops by name to handle duplicates
			const stopsByName = new Map();
			for (const stop of result.results) {
				const stopName = stop.stopName;
				if (!stopsByName.has(stopName)) {
					stopsByName.set(stopName, []);
				}
				stopsByName.get(stopName).push({
					stopId: stop.stopCode,
					stopCode: stop.stopCode,
					stopName: stop.stopName,
					lat: stop.lat,
					lon: stop.lon,
				});
			}

			// Create one entry per unique stop name
			return Array.from(stopsByName.entries()).map(([name, stopList]) => {
				if (stopList.length === 1) {
					return stopList[0];
				} else {
					// Multiple stop IDs for this name - combine them
					return {
						stopId: stopList.map(s => s.stopId).join(','),
						stopCode: stopList.map(s => s.stopCode).join(','),
						stopName: name,
						lat: stopList[0].lat,
						lon: stopList[0].lon,
					};
				}
			}).sort((a, b) => a.stopName.localeCompare(b.stopName));
		} catch (error) {
			console.error("Error fetching cached stops:", error);
			return [];
		}
	}

	private async cacheStopsData(db: D1Database, agencyCode: string, routeCode: string, routeStopsData: any[]) {
		// This is the same caching logic from routeStops.ts
		// Reusing it to maintain consistency
		try {
			const agency = await db.prepare(
				"SELECT id FROM agencies WHERE code = ?"
			).bind(agencyCode).first();
			
			if (!agency) return;

			const route = await db.prepare(
				"SELECT id FROM routes WHERE agency_id = ? AND route_code = ?"
			).bind(agency.id, routeCode).first();
			
			if (!route) return;

			for (const routeDirection of routeStopsData) {
				// Ensure direction exists
				let direction = await db.prepare(
					"SELECT id FROM directions WHERE route_id = ? AND direction_code = ?"
				).bind(route.id, routeDirection.Direction).first();

				if (!direction) {
					await db.prepare(
						"INSERT INTO directions (route_id, direction_code, headsign, active) VALUES (?, ?, ?, TRUE)"
					).bind(route.id, routeDirection.Direction, routeDirection.Destination).run();
					
					direction = await db.prepare(
						"SELECT id FROM directions WHERE route_id = ? AND direction_code = ?"
					).bind(route.id, routeDirection.Direction).first();
				}

				// Import each stop
				for (const stop of routeDirection.Stops) {
					await db.prepare(`
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
						agency.id,
						stop.StopId.toString(),
						stop.Name,
						stop.Latitude,
						stop.Longitude
					).run();

					const stopRecord = await db.prepare(
						"SELECT id FROM stops WHERE agency_id = ? AND stop_code = ?"
					).bind(agency.id, stop.StopId.toString()).first();

					if (stopRecord && direction) {
						await db.prepare(`
							INSERT INTO stop_routes (stop_id, route_id, direction_id, stop_sequence, active)
							VALUES (?, ?, ?, ?, TRUE)
							ON CONFLICT(stop_id, route_id, direction_id) 
							DO UPDATE SET 
								stop_sequence = excluded.stop_sequence,
								active = TRUE,
								created_at = CURRENT_TIMESTAMP
						`).bind(stopRecord.id, route.id, direction.id, stop.Order).run();
					}
				}
			}
		} catch (error) {
			console.error("Error caching stops:", error);
		}
	}
}