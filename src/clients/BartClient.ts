import { z } from "zod";

// BART API response schemas
const BartStation = z.object({
	name: z.string(),
	abbr: z.string(),
	gtfs_latitude: z.string(),
	gtfs_longitude: z.string(),
	address: z.string(),
	city: z.string(),
	county: z.string(),
	state: z.string(),
	zipcode: z.string(),
});

const BartRoute = z.object({
	name: z.string(),
	abbr: z.string(),
	routeID: z.string(),
	number: z.string(),
	hexcolor: z.string(),
	color: z.string(),
});

const BartEstimate = z.object({
	minutes: z.string(), // "Leaving" for trains departing now
	platform: z.string(),
	direction: z.string(),
	length: z.string(),
	color: z.string(),
	hexcolor: z.string(),
	bikeflag: z.string(),
	delay: z.string(),
	cancelflag: z.string(),
	dynamicflag: z.string(),
});

const BartETD = z.object({
	destination: z.string(),
	abbreviation: z.string(),
	limited: z.string(),
	estimate: z.array(BartEstimate),
});

const BartDepartureStation = z.object({
	name: z.string(),
	abbr: z.string(),
	etd: z.array(BartETD).optional(),
});

const BartStationsResponse = z.object({
	root: z.object({
		stations: z.object({
			station: z.array(BartStation),
		}),
	}),
});

const BartRoutesResponse = z.object({
	root: z.object({
		routes: z.object({
			route: z.array(BartRoute),
		}),
	}),
});

const BartDeparturesResponse = z.object({
	root: z.object({
		station: z.array(BartDepartureStation),
	}),
});

export interface TransitPrediction {
	arrivalTime: string;
	departureTime: string;
	stopName: string;
	stopId: string;
	route: string;
	direction: string;
	vehicleId: string;
	minutesUntilArrival: number;
}

export class BartClient {
	private readonly baseURL = "https://api.bart.gov/api";
	private readonly apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
		console.log('BartClient initialized with key:', apiKey ? `${apiKey.substring(0, 4)}...` : 'NO KEY');
	}

	async getStations() {
		const url = `${this.baseURL}/stn.aspx?cmd=stns&key=${this.apiKey}&json=y`;
		const response = await fetch(url);
		
		if (!response.ok) {
			throw new Error(`BART API error: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		const apiResponse = BartStationsResponse.parse(data);
		
		return apiResponse.root.stations.station.map(station => ({
			stopId: station.abbr,
			stopCode: station.abbr,
			stopName: station.name,
			lat: parseFloat(station.gtfs_latitude),
			lon: parseFloat(station.gtfs_longitude),
		}));
	}

	async getRoutes() {
		// For BART, we'll return a single "route" since all trains operate on the same system
		// Individual lines/colors will be shown as directions
		return [{
			routeCode: "BART",
			routeName: "BART System",
			routeType: "rail",
			active: true,
		}];
	}

	async getPredictions(stopId: string, route?: string): Promise<TransitPrediction[]> {
		// BART doesn't filter by route in the API - it returns all departures
		// We'll filter client-side if a route (color) is specified
		const url = `${this.baseURL}/etd.aspx?cmd=etd&orig=${stopId}&key=${this.apiKey}&json=y`;
		const response = await fetch(url);
		
		if (!response.ok) {
			throw new Error(`BART API error: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		
		// Handle case where station has no departures
		if (!data.root || !data.root.station || data.root.station.length === 0) {
			return [];
		}

		const apiResponse = BartDeparturesResponse.parse(data);
		const station = apiResponse.root.station[0];
		
		if (!station.etd || station.etd.length === 0) {
			return [];
		}

		const predictions: TransitPrediction[] = [];
		const now = new Date();
		
		for (const etd of station.etd) {
			for (const estimate of etd.estimate) {
				// Skip if filtering by route (color) and doesn't match
				if (route && estimate.color !== route) {
					continue;
				}

				// Calculate arrival time
				let minutesUntilArrival: number;
				if (estimate.minutes === "Leaving") {
					minutesUntilArrival = 0;
				} else {
					minutesUntilArrival = parseInt(estimate.minutes);
				}
				
				const arrivalTime = new Date(now.getTime() + minutesUntilArrival * 60000);
				const departureTime = arrivalTime; // For BART, arrival and departure are the same
				
				predictions.push({
					arrivalTime: arrivalTime.toISOString(),
					departureTime: departureTime.toISOString(),
					stopName: station.name,
					stopId: station.abbr,
					route: estimate.color, // Use color as route identifier
					direction: `To ${etd.destination}`,
					vehicleId: "", // BART doesn't provide train IDs in real-time API
					minutesUntilArrival,
				});
			}
		}
		
		// Sort by arrival time and return top 3
		return predictions
			.sort((a, b) => a.minutesUntilArrival - b.minutesUntilArrival)
			.slice(0, 3);
	}

	async getStationsForRoute(routeColor: string) {
		// BART's route API doesn't directly provide stations per route
		// For a complete implementation, we'd need to parse route details
		// For now, return all stations as BART is a connected system
		return this.getStations();
	}

	async getDirectionsForStop(stopId: string) {
		// Get real-time departures to determine available directions
		const url = `${this.baseURL}/etd.aspx?cmd=etd&orig=${stopId}&key=${this.apiKey}&json=y`;
		const response = await fetch(url);
		
		if (!response.ok) {
			throw new Error(`BART API error: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		
		if (!data.root || !data.root.station || data.root.station.length === 0) {
			return [];
		}

		const apiResponse = BartDeparturesResponse.parse(data);
		const station = apiResponse.root.station[0];
		
		if (!station.etd || station.etd.length === 0) {
			return [];
		}

		// Group by destination and color
		const directionsMap = new Map<string, any>();
		
		for (const etd of station.etd) {
			if (etd.estimate && etd.estimate.length > 0) {
				const firstEstimate = etd.estimate[0];
				const direction = firstEstimate.direction;
				const color = firstEstimate.color;
				const key = `${color}-${etd.destination}`;
				
				if (!directionsMap.has(key)) {
					directionsMap.set(key, {
						direction: `${color} Line`,
						destination: etd.destination,
						stopId: stopId, // BART uses same stop for all directions
						color: color, // Include color for filtering
					});
				}
			}
		}
		
		return Array.from(directionsMap.values());
	}
}