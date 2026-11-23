import { env } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";

// Inject Cloudflare Worker secrets and bindings into Node's process.env
if (env && typeof env === "object") {
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      process.env[key] = value;
    }
  }
}

import app from "./app.js";
import d1 from "./db/d1.js";

d1.setDatabase(env.DB);

const port = 8788;
app.listen(port);

export default httpServerHandler({ port });
