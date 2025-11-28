/** @format */

import express from "express";
import { isAdmin, verifyToken } from "../middlewares/auth";
import { createTemplate, deleteTemplate, getAllTemplates, updateTemplate } from "../controllers/template.controller";

const templateRouter = express.Router();

templateRouter.post("/create-template", verifyToken, isAdmin, createTemplate);
templateRouter.get("/all-templates", verifyToken, isAdmin, getAllTemplates);
templateRouter.delete("/delete-template/:id", verifyToken, isAdmin, deleteTemplate);
templateRouter.put("/update-template/:id", verifyToken, isAdmin, updateTemplate);

export default templateRouter;
