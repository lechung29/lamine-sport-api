/** @format */

import express from "express";
import { adminUpdateInfo, adminUpdatePassword, deleteCustomer, getAllUsers, updateUserStatus, userCreatePassword, userUpdateInfo, userUpdatePassword } from "../controllers/user.controller";
import { isAdmin, isLocked, verifyToken } from "../middlewares/auth";

const userRouter = express.Router();

userRouter.get("/get-all-customers", verifyToken, isAdmin, getAllUsers);
userRouter.put("/update-customer-status", verifyToken, isAdmin, updateUserStatus);
userRouter.delete("/delete-customer/:id", verifyToken, isAdmin, deleteCustomer);
userRouter.post("/admin-update-info", verifyToken, isAdmin, adminUpdateInfo);
userRouter.post("/admin-update-password", verifyToken, isAdmin, adminUpdatePassword);
userRouter.post("/user-update-info", verifyToken, isLocked, userUpdateInfo);
userRouter.post("/user-update-password", verifyToken, isLocked, userUpdatePassword);
userRouter.post("/user-create-password", verifyToken, isLocked, userCreatePassword);

export default userRouter;
