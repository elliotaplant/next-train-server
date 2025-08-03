import { OpenAPIRoute, Str, Num } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types";
import { AcTransitClient, type TransitPrediction } from "../clients/AcTransitClient";
import { BartClient, type BartPrediction } from "../clients/BartClient";

export class TransitPredictions extends OpenAPIRoute {
	schema = {
		tags: ["Transit"],
		summary: "Get transit predictions",
		request: {
			query: z.object({
				agency: Str({ 
					description: "Transit agency identifier (actransit or bart)",
					example: "actransit"
				}),
				stop: Str({ 
					description: "Stop ID (numeric for AC Transit, station abbreviation for BART)",
					example: "55558"
				}),
				route: Str({ 
					description: "Route identifier (route name for AC Transit, comma-separated line colors for BART)",
					example: "NL"
				}),
				direction: Str({ 
					description: "Direction of travel (optional for AC Transit, required for BART: 'n' or 's')",
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

		try {
			let predictions: TransitPrediction[] = [];

			// Route to appropriate agency client
			switch (agency.toLowerCase()) {
				case "actransit":
					const acTransitClient = new AcTransitClient(c.env.AC_TRANSIT_API_KEY);
					predictions = await acTransitClient.getPredictions(stop, route);
					break;
					
				case "bart":
					// For BART, route is required and can be comma-separated
					if (!route) {
						return Response.json(
							{
								success: false,
								error: "Route parameter is required for BART. Specify one or more line colors (e.g., 'red' or 'red,yellow').",
							},
							{ status: 400 }
						);
					}
					
					// Direction is required for BART
					if (!direction || !['n', 's'].includes(direction.toLowerCase())) {
						return Response.json(
							{
								success: false,
								error: "Direction parameter is required for BART. Use 'n' for north or 's' for south.",
							},
							{ status: 400 }
						);
					}
					
					const bartClient = new BartClient(c.env.BART_API_KEY);
					const lines = route.split(',').map(l => l.trim());
					const bartPredictions = await bartClient.getPredictions(
						stop.toUpperCase(), 
						lines, 
						direction.toLowerCase() as 'n' | 's'
					);
					predictions = bartPredictions;
					break;
					
				default:
					return Response.json(
						{
							success: false,
							error: `Unsupported agency: ${agency}. Supported agencies are 'actransit' and 'bart'.`,
						},
						{ status: 400 }
					);
			}

			// Apply direction filter if provided (only for AC Transit)
			// BART already filters by direction in the client
			if (direction && agency.toLowerCase() !== 'bart') {
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