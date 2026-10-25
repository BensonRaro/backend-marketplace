// Inngest client — send events + create functions (one app id across all jobs)
// Dev server: npx inngest-cli@latest dev -u http://localhost:5000/api/inngest
import "dotenv/config";
import { Inngest } from "inngest";

// Env is loaded before the client is constructed (signing key / dev flag read here)
export const inngest = new Inngest({ id: "freelance-marketplace" });
