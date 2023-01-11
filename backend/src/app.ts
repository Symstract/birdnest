import * as dotenv from "dotenv";
import express from "express";

import router from "./routes";
import violationMonitor from "./NDZviolationMonitoring";

const main = () => {
  dotenv.config();

  violationMonitor.start();

  const app = express();

  app.use("/", router);

  const port = process.env.PORT || 5000;

  app.listen(port, () => console.log(`Server started on port ${port}`));
};

main();
