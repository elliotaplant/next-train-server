export interface BartPrediction {
    arrivalTime: string;
    departureTime: string;
    stopName: string;
    stopId: string;
    route: string;
    direction: string;
    vehicleId: string;
    minutesUntilArrival: number;
}

interface BartApiResponse {
    root: {
        station: Array<{
            name: string;
            abbr: string;
            etd: Array<{
                destination: string;
                abbreviation: string;
                limited: string;
                estimate: Array<{
                    minutes: string;
                    platform: string;
                    direction: string;
                    length: string;
                    color: string;
                    hexcolor: string;
                    bikeflag: string;
                    delay: string;
                    cancelflag: string;
                    dynamicflag: string;
                }>;
            }>;
        }>;
    };
}

export class BartClient {
    private apiKey: string;
    private baseUrl = 'https://api.bart.gov/api';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async getPredictions(
        station: string,
        lines: string[],
        direction: 'n' | 's'
    ): Promise<BartPrediction[]> {
        try {
            const url = `${this.baseUrl}/etd.aspx?cmd=etd&orig=${station}&key=${this.apiKey}&json=y`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`BART API error: ${response.status}`);
            }

            const data = await response.json();
            
            // Handle the nested structure from BART API
            if (!data?.root?.station?.[0]) {
                return [];
            }

            const stationData = data.root.station[0];
            const predictions: BartPrediction[] = [];

            for (const etd of stationData.etd || []) {
                for (const estimate of etd.estimate || []) {
                    // Filter by direction (API returns "North"/"South", we expect "n"/"s")
                    const apiDirection = estimate.direction.toLowerCase().charAt(0);
                    const lineColor = estimate.color.toLowerCase();
                    
                    if (apiDirection !== direction) {
                        continue;
                    }

                    // Filter by line color
                    if (!lines.some(line => line.toLowerCase() === lineColor)) {
                        continue;
                    }

                    // Skip cancelled trains
                    if (estimate.cancelflag === '1') {
                        continue;
                    }

                    const now = new Date();
                    const minutesUntil = estimate.minutes === 'Leaving' ? 0 : parseInt(estimate.minutes);
                    const arrivalTime = new Date(now.getTime() + minutesUntil * 60 * 1000);

                    const prediction = {
                        arrivalTime: arrivalTime.toISOString(),
                        departureTime: arrivalTime.toISOString(),
                        stopName: stationData.name,
                        stopId: stationData.abbr,
                        route: lineColor.toUpperCase(),
                        direction: etd.destination,
                        vehicleId: '', // BART doesn't provide vehicle IDs in ETD
                        minutesUntilArrival: minutesUntil,
                    };
                    
                    predictions.push(prediction);
                }
            }

            // Sort by arrival time
            predictions.sort((a, b) => 
                new Date(a.arrivalTime).getTime() - new Date(b.arrivalTime).getTime()
            );
            
            return predictions;
        } catch (error) {
            console.error('BART API error:', error);
            throw error;
        }
    }
}