// Extend the auto-generated Env interface to include secrets
interface Env {
	// Secrets
	AC_TRANSIT_API_KEY: string;
	
	// Email binding
	SUPPORT_EMAIL: SendEmail;
	
	// Assets
	ASSETS: Fetcher;
}