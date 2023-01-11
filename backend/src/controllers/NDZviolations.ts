import { Request, Response } from "express";

import violationMonitor from "../NDZviolationMonitoring";

export const getViolations = (req: Request, res: Response) => {
  res.status(200).json(violationMonitor.getViolations());
};
