/** @format */

import express from "express";
import { isAdmin, verifyToken } from "../middlewares/auth";
import { createReview, deleteReview, getAllReviews, getPinReview, pinReview, sendEmailForReviewer } from "../controllers/review.controller";

const reviewRoutes = express.Router();

reviewRoutes.post("/create-review", createReview);
reviewRoutes.get("/get-reviews", verifyToken, isAdmin, getAllReviews);
reviewRoutes.delete("/delete-review/:id", verifyToken, isAdmin, deleteReview);
reviewRoutes.post("/pin-review/:id", verifyToken, isAdmin, pinReview);
reviewRoutes.post("/send-email-for-customer", verifyToken, isAdmin, sendEmailForReviewer);
reviewRoutes.get("/get-pin-reviews", getPinReview);

export default reviewRoutes;
