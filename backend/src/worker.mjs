import { handleAsNodeRequest } from "cloudflare:node";
import { connect } from "cloudflare:sockets";

import app from "./app.js";
import d1 from "./db/d1.js";
import mailer from "./config/mailer.js";

mailer.setSocketConnector(connect);

const port = 8788;
app.listen(port);

export default {
  fetch(request, env) {
    if (env) {
      for (const [key, val] of Object.entries(env)) {
        if (typeof val === "string" && !process.env[key]) {
          process.env[key] = val;
        }
      }
    }
    d1.setDatabase(env.DB);
    return handleAsNodeRequest(port, request);
  },
};
