/** @format */

import express from "express";
import { isAdmin, isLocked, verifyToken } from "../middlewares/auth";
import { applyCoupon, createNewCoupon, deleteCoupon, getCoupons, updateCoupon } from "../controllers/coupon.controller";

const couponRouter = express.Router();

couponRouter.post("/create-coupon", verifyToken, isAdmin, createNewCoupon);
couponRouter.get("/get-all-coupon", verifyToken, isLocked, getCoupons);
couponRouter.put("/update-coupon", verifyToken, isAdmin, updateCoupon);
couponRouter.delete("/delete-coupon/:couponCode", verifyToken, isAdmin, deleteCoupon);
couponRouter.post("/validate-coupon", applyCoupon);

export default couponRouter;
