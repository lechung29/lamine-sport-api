/** @format */

import express from "express";
import { isAdmin, verifyToken } from "../middlewares/auth";
import { cancelProgram, createDiscountProgram, getCurrentProgram, updateProgram } from "../controllers/discount.controller";

const discountRoutes = express.Router();

discountRoutes.post("/create-discount", verifyToken, isAdmin, createDiscountProgram);
discountRoutes.get("/current-program", getCurrentProgram);
discountRoutes.put("/update-program", verifyToken, isAdmin, updateProgram);
discountRoutes.put("/cancel-program", verifyToken, isAdmin, cancelProgram);

export default discountRoutes;
