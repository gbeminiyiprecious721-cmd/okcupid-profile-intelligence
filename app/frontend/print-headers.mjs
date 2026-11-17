import { SECURITY_HEADERS } from "./security-headers.mjs";
for (const [name, value] of Object.entries(SECURITY_HEADERS)) console.log(`${name}: ${value}`);
