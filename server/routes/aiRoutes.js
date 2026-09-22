import express from "express";
import { workspaceCopilot } from "../controllers/aiController.js";
import { sprintPlan } from "../controllers/sprintPlannerController.js";

const aiRouter = express.Router();

aiRouter.post("/chat", workspaceCopilot);
aiRouter.post("/sprint-plan", sprintPlan);

export default aiRouter;
