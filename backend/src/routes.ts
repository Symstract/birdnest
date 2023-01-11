import express from "express";

import { getViolations } from "./controllers/NDZviolations";

const router = express.Router();

router.get("/api/ndz-violations", getViolations);

export default router;
