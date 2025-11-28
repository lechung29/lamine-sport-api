/** @format */

import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import Users, { IUserInfo, IResponseStatus, ICustomerStatus } from "../models/users/users.model";

export interface AuthenticatedRequest extends Request {
    user?: IUserInfo;
}

export const verifyToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        
        const token = req.headers["x-token"] as string;
        if (!token) {
            return res.status(200).send({
                code: 401,
                status: IResponseStatus.Error,
                message: "Phiên đăng nhập đã hết hạn",
                errorMessage: "No token valid",
            });
        }

        const payload = jwt.verify(token, process.env.JWT_SECRET!);
        req.user = payload as IUserInfo;
        next();
    } catch (error: any) {
        if (error.name === "TokenExpiredError") {
            return res.status(200).send({
                code: 401,
                status: IResponseStatus.Error,
                message: "Phiên đăng nhập đã hết hạn",
                errorMessage: "Token expired",
            });
        }
        return res.status(200).send({
            code: 401,
            status: IResponseStatus.Error,
            message: "Phiên đăng nhập đã hết hạn",
            errorMessage: "Invalid token",
        });
    }
};

export const isAdmin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const admin = await Users.findById(req.user?.id);
    if (admin?.role !== "admin") {
        return res.status(401).send({
            code: 401,
            status: IResponseStatus.Error,
            message: "Bạn không có quyền vào trang này",
            errorMessage: "User don't have permission to access",
        });
    }
    next();
};

export const isLocked = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = await Users.findById(req.user?.id);
    if (user?.status === ICustomerStatus.Locked) {
        return res.status(200).send({
            code: 403,
            status: IResponseStatus.Error,
            message: "Tài khoản của bạn đã bị khóa, vui lòng liên hệ bộ phận chăm sóc khách hàng để hỗ trợ",
        });
    }
    next();
};
