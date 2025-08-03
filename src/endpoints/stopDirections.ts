import { Bool, OpenAPIRoute, Str, Query } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types";

export class StopDirections extends OpenAPIRoute {
	schema = {
		tags: ["Transit"],
		summary: "Get available directions for a specific stop on a route",
		request: {
			query: z.object({
				agency: Str({ description: "Transit agency code", example: "actransit" }),
				route: Str({ description: "Route code", example: "NL" }),
				stop: Str({ description: "Stop ID (can be comma-separated for combined stops)", example: "55558" }),
			}),
		},
		responses: {
			"200": {
				description: "Directions retrieved successfully",
				content: {
					"application/json": {
						schema: z.object({
							success: Bool(),
							agency: Str(),
							route: Str(),
							stop: Str(),
							directions: z.array(z.object({
								direction: Str(),
								destination: Str(),
								stopId: Str(),
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
				description: "Route or stop not found",
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
		const { agency, route, stop } = data.query;

		try {
			if (agency !== "actransit") {
				return Response.json(
					{
						success: false,
						error: "Only AC Transit is currently supported",
					},
					{ status: 400 }
				);
			}

			// Fetch route data to find directions serving this stop
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

			// Handle comma-separated stop IDs (for stops with same name but different IDs)
			const stopIds = stop.split(',').map(id => id.trim());
			
			// Find directions that serve any of these stop IDs
			// Also track which stop ID serves which direction
			const directionsMap = new Map();
			
			for (const routeDirection of routeStopsData) {
				for (const stopId of stopIds) {
					const hasStop = routeDirection.Stops.some((s: any) => s.StopId.toString() === stopId);
					if (hasStop && !directionsMap.has(routeDirection.Direction)) {
						directionsMap.set(routeDirection.Direction, {
							direction: routeDirection.Direction,
							destination: routeDirection.Destination,
							stopId: stopId, // Include which stop ID to use for this direction
						});
					}
				}
			}
			
			const directionsForStop = Array.from(directionsMap.values());

			if (directionsForStop.length === 0) {
				return Response.json(
					{
						success: false,
						error: `Stop ${stop} not found on route ${route}`,
					},
					{ status: 404 }
				);
			}

			return {
				success: true,
				agency,
				route,
				stop,
				directions: directionsForStop,
			};
		} catch (error) {
			console.error("StopDirections error:", error);
			return Response.json(
				{
					success: false,
					error: error instanceof Error ? error.message : "Failed to fetch directions",
				},
				{ status: 500 }
			);
		}
	}
}