import { Bool, OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types";

export class TransitMetadata extends OpenAPIRoute {
	schema = {
		tags: ["Transit"],
		summary: "Get transit metadata (agencies, routes, stops, directions)",
		request: {
			query: z.object({
				agency: Str({ 
					description: "Filter by agency code",
					required: false,
					example: "actransit"
				}),
				route: Str({ 
					description: "Filter by route code (requires agency)",
					required: false,
					example: "NL"
				}),
				includeInactive: Bool({
					description: "Include inactive/discontinued items",
					required: false,
					default: false
				}),
				includeStops: Bool({
					description: "Include stops in response",
					required: false,
					default: true
				}),
			}),
		},
		responses: {
			"200": {
				description: "Returns transit metadata",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							agencies: z.array(z.object({
								id: z.number(),
								code: Str(),
								name: Str(),
								active: Bool(),
							})),
							routes: z.array(z.object({
								id: z.number(),
								agencyId: z.number(),
								routeCode: Str(),
								routeName: Str().nullable(),
								routeType: Str().nullable(),
								active: Bool(),
							})),
							stops: z.array(z.object({
								id: z.number(),
								agencyId: z.number(),
								stopCode: Str(),
								stopName: Str(),
								lat: z.number().nullable(),
								lon: z.number().nullable(),
								active: Bool(),
								routes: z.array(Str()), // Route codes this stop serves
							})),
							directions: z.array(z.object({
								id: z.number(),
								routeId: z.number(),
								directionCode: Str().nullable(),
								headsign: Str().nullable(),
								active: Bool(),
							})),
						}),
					},
				},
			},
			"400": {
				description: "Bad request",
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
		const { agency, route, includeInactive, includeStops } = data.query;

		try {
			const activeFilter = includeInactive ? "" : " AND active = TRUE";

			// Get agencies
			let agencyQuery = "SELECT id, code, name, active FROM agencies WHERE 1=1";
			const agencyParams: any[] = [];
			
			if (agency) {
				agencyQuery += " AND code = ?";
				agencyParams.push(agency);
			}
			if (!includeInactive) {
				agencyQuery += " AND active = TRUE";
			}

			const agencies = await c.env.DB.prepare(agencyQuery)
				.bind(...agencyParams)
				.all();

			// Get routes
			let routeQuery = `
				SELECT r.id, r.agency_id as agencyId, r.route_code as routeCode, 
					   r.route_name as routeName, r.route_type as routeType, r.active
				FROM routes r
				WHERE 1=1
			`;
			const routeParams: any[] = [];

			if (agency) {
				routeQuery += " AND r.agency_id = (SELECT id FROM agencies WHERE code = ?)";
				routeParams.push(agency);
			}
			if (route) {
				routeQuery += " AND r.route_code = ?";
				routeParams.push(route);
			}
			if (!includeInactive) {
				routeQuery += " AND r.active = TRUE";
			}

			const routes = await c.env.DB.prepare(routeQuery)
				.bind(...routeParams)
				.all();

			// Get stops with their associated routes
			let stopQuery = `
				SELECT DISTINCT 
					s.id, s.agency_id as agencyId, s.stop_code as stopCode, 
					s.stop_name as stopName, s.lat, s.lon, s.active
				FROM stops s
				WHERE 1=1
			`;
			const stopParams: any[] = [];

			if (agency) {
				stopQuery += " AND s.agency_id = (SELECT id FROM agencies WHERE code = ?)";
				stopParams.push(agency);
			}
			if (route) {
				stopQuery += ` AND s.id IN (
					SELECT sr.stop_id 
					FROM stop_routes sr 
					JOIN routes r ON sr.route_id = r.id 
					WHERE r.route_code = ?
				)`;
				stopParams.push(route);
			}
			if (!includeInactive) {
				stopQuery += " AND s.active = TRUE";
			}

			const stops = await c.env.DB.prepare(stopQuery)
				.bind(...stopParams)
				.all();

			// Get route associations for each stop
			const stopsWithRoutes = await Promise.all(
				stops.results.map(async (stop) => {
					const routesForStop = await c.env.DB.prepare(`
						SELECT DISTINCT r.route_code
						FROM stop_routes sr
						JOIN routes r ON sr.route_id = r.id
						WHERE sr.stop_id = ?
						${!includeInactive ? "AND sr.active = TRUE AND r.active = TRUE" : ""}
					`).bind(stop.id).all();

					return {
						...stop,
						routes: routesForStop.results.map(r => r.route_code as string)
					};
				})
			);

			// Get directions
			let directionQuery = `
				SELECT d.id, d.route_id as routeId, d.direction_code as directionCode, 
					   d.headsign, d.active
				FROM directions d
				WHERE 1=1
			`;
			const directionParams: any[] = [];

			if (route) {
				directionQuery += ` AND d.route_id IN (
					SELECT id FROM routes WHERE route_code = ?
				)`;
				directionParams.push(route);
			}
			if (agency) {
				directionQuery += ` AND d.route_id IN (
					SELECT id FROM routes WHERE agency_id = (SELECT id FROM agencies WHERE code = ?)
				)`;
				directionParams.push(agency);
			}
			if (!includeInactive) {
				directionQuery += " AND d.active = TRUE";
			}

			const directions = await c.env.DB.prepare(directionQuery)
				.bind(...directionParams)
				.all();

			return {
				success: true,
				agencies: agencies.results,
				routes: routes.results,
				stops: stopsWithRoutes,
				directions: directions.results,
			};
		} catch (error) {
			console.error("Transit metadata error:", error);
			return Response.json(
				{
					success: false,
					error: "Failed to fetch transit metadata",
				},
				{ status: 400 }
			);
		}
	}
}