/** @format */

import express from "express";
import { isAdmin, isLocked, verifyToken } from "../middlewares/auth";
import { cancelOrder, createOrder, getAllOrders, getDashboardStats, getDetailsOrder, getMyOrders, updateOrdersStatus } from "../controllers/order.controller";

const orderRoutes = express.Router();

orderRoutes.post("/create-order", verifyToken, isLocked, createOrder);
orderRoutes.get("/get-user-orders", verifyToken, isLocked, getMyOrders);
orderRoutes.post("/:orderId/cancel-order", verifyToken, isLocked, cancelOrder);
orderRoutes.get("/get-all-orders", verifyToken, isAdmin, getAllOrders);
orderRoutes.put("/update-status", verifyToken, isAdmin, updateOrdersStatus);
orderRoutes.get("/get-details-order/:orderId", verifyToken, isAdmin, getDetailsOrder);
orderRoutes.get("/get-dashboard-stats", verifyToken, isAdmin, getDashboardStats);

export default orderRoutes;
