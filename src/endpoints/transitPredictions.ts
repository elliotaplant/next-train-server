import { OpenAPIRoute, Str, Num } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types";
import { AcTransitClient, type TransitPrediction } from "../clients/AcTransitClient";

export class TransitPredictions extends OpenAPIRoute {
	schema = {
		tags: ["Transit"],
		summary: "Get transit predictions",
		request: {
			query: z.object({
				agency: Str({ 
					description: "Transit agency identifier",
					example: "actransit"
				}),
				stop: Str({ 
					description: "Stop ID",
					example: "55558"
				}),
				route: Str({ 
					description: "Route identifier",
					example: "NL"
				}),
				direction: Str({ 
					description: "Direction of travel",
					required: false,
					example: "To SF"
				}),
				headsign: Str({ 
					description: "Destination headsign",
					required: false 
				}),
			}),
		},
		responses: {
			"200": {
				description: "Returns transit predictions",
				content: {
					"application/json": {
						schema: z.object({
							success: z.boolean(),
							agency: Str(),
							stop: Str(),
							route: Str(),
							predictions: z.array(z.object({
								arrivalTime: Str({ description: "ISO 8601 arrival time" }),
								departureTime: Str({ description: "ISO 8601 departure time" }),
								stopName: Str(),
								stopId: Str(),
								route: Str(),
								direction: Str(),
								vehicleId: Str(),
								minutesUntilArrival: Num({ description: "Minutes until arrival" }),
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
							success: z.boolean(),
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
							success: z.boolean(),
							error: Str(),
						}),
					},
				},
			},
		},
	};

	async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { agency, stop, route, direction, headsign } = data.query;

		// Create cache key for predictions
		const cacheKey = `predictions:${agency}:${stop}:${route}`;
		const cache = caches.default;

		// Try to get from cache (10 second TTL for predictions)
		const cacheUrl = new URL(c.req.url);
		cacheUrl.searchParams.set('cache-key', cacheKey);
		const cachedResponse = await cache.match(cacheUrl.toString());
		
		if (cachedResponse) {
			const age = cachedResponse.headers.get('age');
			if (age && parseInt(age) < 10) {
				// Cache hit and fresh (less than 10 seconds old)
				const cachedData = await cachedResponse.json();
				
				// Apply direction filter if needed
				if (direction && cachedData.predictions) {
					cachedData.predictions = cachedData.predictions.filter((p: TransitPrediction) => 
						p.direction.toLowerCase().includes(direction.toLowerCase())
					);
				}
				
				return cachedData;
			}
		}

		try {
			let predictions: TransitPrediction[] = [];

			// Route to appropriate agency client
			switch (agency.toLowerCase()) {
				case "actransit":
					const acTransitClient = new AcTransitClient(c.env.AC_TRANSIT_API_KEY);
					predictions = await acTransitClient.getPredictions(stop, route);
					break;
					
				default:
					return Response.json(
						{
							success: false,
							error: `Unsupported agency: ${agency}. Currently only 'actransit' is supported.`,
						},
						{ status: 400 }
					);
			}

			// Create response data
			const responseData = {
				success: true,
				agency,
				stop,
				route,
				predictions,
			};

			// Cache the unfiltered response
			const cacheResponse = new Response(JSON.stringify(responseData), {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'max-age=10', // 10 second cache
				},
			});
			
			// Store in cache
			c.executionCtx.waitUntil(cache.put(cacheUrl.toString(), cacheResponse.clone()));

			// Apply direction filter if provided  
			if (direction) {
				predictions = predictions.filter(p => 
					p.direction.toLowerCase().includes(direction.toLowerCase())
				);
			}

			return {
				success: true,
				agency,
				stop,
				route,
				predictions,
			};
		} catch (error) {
			console.error("Transit prediction error:", error);
			
			// Check if it's a known error type
			if (error instanceof Error) {
				if (error.message.includes("Only NL route")) {
					return Response.json(
						{
							success: false,
							error: error.message,
						},
						{ status: 400 }
					);
				}
			}
			
			return Response.json(
				{
					success: false,
					error: "Failed to fetch transit predictions",
				},
				{ status: 500 }
			);
		}
	}
}