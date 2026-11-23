import { handleAsNodeRequest } from "cloudflare:node";

import app from "./app.js";
import d1 from "./db/d1.js";

const port = 8788;
app.listen(port);

export default {
  fetch(request, env) {
    d1.setDatabase(env.DB);
    return handleAsNodeRequest(port, request);
  },
};
