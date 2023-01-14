import { Request, Response } from "express";

import violationMonitor from "../NDZviolationMonitoring";

export const getViolations = (req: Request, res: Response) => {
  res
    .set("Access-Control-Allow-Origin", "*")
    .status(200)
    .json({
      violations: violationMonitor.getViolations(),
      lastUpdatedAt: violationMonitor.lastUpdatedAt,
    });
};
