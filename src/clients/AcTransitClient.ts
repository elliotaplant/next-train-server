import { z } from "zod";

// AC Transit API response schemas
const AcTransitPrediction = z.object({
	tmstmp: z.string().optional(),
	typ: z.string().optional(),
	stpnm: z.string(),
	stpid: z.string(),
	vid: z.string(),
	dstp: z.number().optional(),
	rt: z.string(),
	rtdd: z.string().optional(),
	rtdir: z.string(),
	des: z.string().optional(),
	prdtm: z.string(),
	tablockid: z.string().optional(),
	tatripid: z.string().optional(),
	dly: z.boolean().optional(),
	prdctdn: z.string().optional(),
	zone: z.string().optional(),
});

const AcTransitPredictionResponse = z.object({
	prd: z.array(AcTransitPrediction).optional(),
	error: z.array(z.object({
		msg: z.string(),
		stpid: z.string().optional(),
		rt: z.string().optional(),
	})).optional(),
});

const AcTransitAPIResponse = z.object({
	"bustime-response": AcTransitPredictionResponse,
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

export class AcTransitClient {
	private readonly baseURL = "https://api.actransit.org/transit/actrealtime/prediction";
	private readonly apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	async getPredictions(stopId: string, route: string): Promise<TransitPrediction[]> {
		// Only support NL route for now
		if (route !== "NL") {
			throw new Error("Only NL route is currently supported");
		}

		const url = new URL(this.baseURL);
		url.searchParams.append("stpid", stopId);
		url.searchParams.append("rt", route);
		url.searchParams.append("top", "3");
		url.searchParams.append("token", this.apiKey);

		const response = await fetch(url.toString());
		
		if (!response.ok) {
			throw new Error(`AC Transit API error: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();
		const apiResponse = AcTransitAPIResponse.parse(data);
		
		const bustimeResponse = apiResponse["bustime-response"];
		
		// Check for API errors
		if (bustimeResponse.error && bustimeResponse.error.length > 0) {
			throw new Error(`AC Transit API error: ${bustimeResponse.error[0].msg}`);
		}

		// Convert AC Transit predictions to our standard format
		const predictions = bustimeResponse.prd || [];
		
		return predictions.map(pred => {
			// Parse the prediction time (format: "yyyyMMdd HH:mm")
			const prdtm = this.parseAcTransitDateTime(pred.prdtm);
			
			// AC Transit predictions are arrival times, subtract 1 minute for departure
			const departureTime = new Date(prdtm.getTime() - 60000);
			
			// Calculate minutes until arrival
			const minutesUntilArrival = Math.round((prdtm.getTime() - Date.now()) / 60000);

			return {
				arrivalTime: prdtm.toISOString(),
				departureTime: departureTime.toISOString(),
				stopName: pred.stpnm,
				stopId: pred.stpid,
				route: pred.rt,
				direction: pred.rtdir,
				vehicleId: pred.vid,
				minutesUntilArrival: Math.max(0, minutesUntilArrival),
			};
		});
	}

	private parseAcTransitDateTime(dateTimeStr: string): Date {
		// Format: "yyyyMMdd HH:mm"
		const year = parseInt(dateTimeStr.substring(0, 4));
		const month = parseInt(dateTimeStr.substring(4, 6)) - 1; // JS months are 0-indexed
		const day = parseInt(dateTimeStr.substring(6, 8));
		const time = dateTimeStr.substring(9);
		const [hours, minutes] = time.split(":").map(n => parseInt(n));

		// AC Transit times are in Pacific Time
		const date = new Date(year, month, day, hours, minutes);
		
		// Note: This assumes the Worker is running in UTC. In production, you might
		// want to use a proper timezone library or ensure consistent timezone handling
		return date;
	}
}