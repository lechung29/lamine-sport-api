/** @format */

import express from "express";
import {
    loginCustomer,
    loginWithGoogle,
    logoutCustomer,
    refreshToken,
    registerNewCustomer,
    requestPasswordRecovery,
    resetPasswordByRPToken,
    verifyRecoveryPasswordToken,
} from "../controllers/auth.controller";

const authRouter = express.Router();

authRouter.post("/register", registerNewCustomer);
authRouter.post("/login", loginCustomer);
authRouter.post("/logout", logoutCustomer);
authRouter.post("/google", loginWithGoogle);
authRouter.post("/forgot-password", requestPasswordRecovery);
authRouter.get("/validation-recovery-password-token", verifyRecoveryPasswordToken);
authRouter.put("/recovery-password", resetPasswordByRPToken);
authRouter.get("/refresh-token", refreshToken);

export default authRouter;
