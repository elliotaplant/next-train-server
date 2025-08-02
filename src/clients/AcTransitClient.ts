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
		// AC Transit times are in Pacific Time (America/Los_Angeles)
		
		// Parse the date/time components
		const year = parseInt(dateTimeStr.substring(0, 4));
		const month = parseInt(dateTimeStr.substring(4, 6)) - 1; // JS months are 0-indexed
		const day = parseInt(dateTimeStr.substring(6, 8));
		const time = dateTimeStr.substring(9);
		const [hours, minutes] = time.split(":").map(n => parseInt(n));

		// Create a date string with Pacific Time offset
		// During PDT (Mar-Nov): UTC-7, During PST (Nov-Mar): UTC-8
		const monthStr = (month + 1).toString().padStart(2, '0');
		const dayStr = day.toString().padStart(2, '0');
		const hoursStr = hours.toString().padStart(2, '0');
		const minutesStr = minutes.toString().padStart(2, '0');
		
		// Check if we're in PDT or PST for this date
		const testDate = new Date(year, month, day);
		const isDST = this.isDaylightSavingTime(testDate);
		const offset = isDST ? '-07:00' : '-08:00';
		
		// Create an ISO string with the correct Pacific offset
		const isoString = `${year}-${monthStr}-${dayStr}T${hoursStr}:${minutesStr}:00${offset}`;
		
		// Parse the ISO string - JavaScript will correctly convert to UTC
		return new Date(isoString);
	}
	
	private isDaylightSavingTime(date: Date): boolean {
		// DST in California runs from second Sunday in March to first Sunday in November
		const year = date.getFullYear();
		
		// Get second Sunday in March
		const march = new Date(year, 2, 1); // March 1st
		const daysUntilSunday = (7 - march.getDay()) % 7;
		const firstSunday = 1 + daysUntilSunday;
		const secondSunday = firstSunday + 7;
		const dstStart = new Date(year, 2, secondSunday);
		
		// Get first Sunday in November
		const november = new Date(year, 10, 1); // November 1st
		const novDaysUntilSunday = (7 - november.getDay()) % 7;
		const novFirstSunday = 1 + novDaysUntilSunday;
		const dstEnd = new Date(year, 10, novFirstSunday);
		
		return date >= dstStart && date < dstEnd;
	}
}