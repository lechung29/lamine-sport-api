/** @format */

import { Request, RequestHandler, Response } from "express";
import Users, { ICustomerStatus, IResponseStatus } from "../models/users/users.model";
import { SortOrder } from "mongoose";
import bcryptjs from "bcryptjs";
import { AuthenticatedRequest } from "../middlewares/auth";

const getAllUsers: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { sort, search, page = "1", limit = "9", ...filters } = req.query;

        const convertPage = parseInt(page as string);
        const convertLimit = parseInt(limit as string);

        const mongoFilter: { [key: string]: Object } = { role: { $ne: "admin" } };
        for (const key in filters) {
            const value = filters[key];
            if (key === "status") {
                const items = Array.isArray(value) ? value.map(Number) : [Number(value)];
                mongoFilter["status"] = { $in: items };
            }
        }

        if (search) {
            mongoFilter.$or = [
                { firstName: { $regex: search, $options: "i" } },
                { lastName: { $regex: search, $options: "i" } },
                { displayName: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
            ];
        }

        const vietnameseCollation = {
            locale: "vi",
            caseLevel: false,
            strength: 1,
        };

        const sortOptions: { [key: string]: SortOrder } = {};
        if (sort === "name_asc") {
            sortOptions.displayName = 1;
        } else if (sort === "name_desc") {
            sortOptions.displayName = -1;
        } else {
            sortOptions.createdAt = -1;
        }

        const totalCounts = await Users.countDocuments(mongoFilter);
        const skip = (convertPage - 1) * convertLimit;

        let pipeline: any[] = [
            { $match: mongoFilter },
            {
                $lookup: {
                    from: "orders",
                    localField: "_id",
                    foreignField: "userId",
                    as: "orders",
                },
            },
            {
                $addFields: {
                    orders: {
                        $filter: {
                            input: "$orders",
                            as: "order",
                            cond: { $ne: ["$$order.orderStatus", 4] },
                        },
                    },
                },
            },
            {
                $addFields: {
                    totalOrders: { $size: "$orders" },
                    totalSpent: {
                        $sum: "$orders.totalPrice",
                    },
                    totalProducts: {
                        $sum: {
                            $map: {
                                input: "$orders",
                                as: "order",
                                in: {
                                    $sum: "$$order.orderItems.quantity",
                                },
                            },
                        },
                    },
                },
            },
            {
                $project: {
                    password: 0,
                    refreshToken: 0,
                    orders: 0,
                },
            },
            { $sort: sortOptions },
            { $skip: skip },
            { $limit: convertLimit },
        ];

        let aggregation = Users.aggregate(pipeline);
        if (sort === "name_asc" || sort === "name_desc") {
            aggregation = aggregation.collation(vietnameseCollation);
        }

        const customers = await aggregation;

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy toàn bộ thông tin người dùng thành công",
            data: {
                customers,
                totalCounts,
            },
        });
    } catch (error) {
        return res.status(500).json({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const updateUserStatus: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { id, status } = req.body;

        if (!id || !status) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "Thiếu thông tin id hoặc status",
            });
        }

        const user = await Users.findById(id);
        if (!user) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Không tìm thấy tài khoản",
            });
        }

        if (user.role === "admin") {
            return res.status(403).send({
                status: IResponseStatus.Error,
                message: "Không thể thay đổi trạng thái tài khoản admin",
            });
        }

        if (user.status === status) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: `Tài khoản đã ở trạng thái ${status}`,
            });
        }

        const updatedUser = await Users.findByIdAndUpdate(
            id,
            {
                status: status,
                updatedAt: new Date(),
            },
            { new: true, select: "-password -refreshToken" }
        );

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: `${status === ICustomerStatus.Active ? "Mở khóa" : "Khóa"} tài khoản thành công`,
        });
    } catch (error) {
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};
const deleteCustomer: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "ID người dùng không được để trống",
            });
        }

        const customer = await Users.findByIdAndDelete(id);

        if (!customer) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Người dùng không tồn tại",
            });
        }

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Xóa tài khoản khách hàng thành công",
        });
    } catch (error) {
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const adminUpdateInfo: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const { displayName, email } = req.body;
        const admin = await Users.findById(userId);
        if (!admin) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Không tìm thấy tài khoản admin",
            });
        }
        await Users.findByIdAndUpdate(
            userId,
            {
                displayName: displayName,
                email: email,
            },
            { timestamps: true }
        );
        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Cập nhật thông tin admin thành công",
        });
    } catch (error) {
        console.error("Lỗi khi cập nhật thông tin:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const userUpdateInfo: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const { displayName, email, phoneNumber, address, avatarUrl } = req.body;
        const user = await Users.findById(userId);
        if (!user) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Không tìm thấy tài khoản người dùng",
            });
        }
        await Users.findByIdAndUpdate(
            userId,
            {
                displayName: displayName,
                email: email,
                address: address,
                phoneNumber: phoneNumber,
                avatar: avatarUrl,
            },
            { timestamps: true }
        );
        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Cập nhật thông tin người dùng thành công",
        });
    } catch (error) {
        console.error("Lỗi khi cập nhật thông tin:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const adminUpdatePassword: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const { password, newPassword } = req.body;
        const admin = await Users.findById(userId);
        if (!admin) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Không tìm thấy tài khoản admin",
            });
        }

        if (!bcryptjs.compareSync(password, admin.password)) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                fieldError: "password",
                message: "Mật khẩu bạn nhập không đúng. Vui lòng kiểm tra lại lần nữa",
            });
        }
        const hashPassword = bcryptjs.hashSync(newPassword, 10);
        await Users.findByIdAndUpdate(
            userId,
            {
                password: hashPassword,
            },
            { timestamps: true }
        );
        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Cập nhật mật khẩu admin thành công",
        });
    } catch (error) {
        console.error("Lỗi khi cập nhật mật khẩu:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const userUpdatePassword: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const { password, newPassword } = req.body;
        const user = await Users.findById(userId);
        if (!user) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Không tìm thấy tài khoản người dùng",
            });
        }

        if (!bcryptjs.compareSync(password, user.password)) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                fieldError: "password",
                message: "Mật khẩu bạn nhập không đúng. Vui lòng kiểm tra lại lần nữa",
            });
        }
        const hashPassword = bcryptjs.hashSync(newPassword, 10);
        await Users.findByIdAndUpdate(
            userId,
            {
                password: hashPassword,
            },
            { timestamps: true }
        );
        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Cập nhật mật khẩu người dùng thành công",
        });
    } catch (error) {
        console.error("Lỗi khi cập nhật mật khẩu:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const userCreatePassword: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const { newPassword } = req.body;
        const user = await Users.findById(userId);
        if (!user) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Không tìm thấy tài khoản người dùng",
            });
        }

        const hashPassword = bcryptjs.hashSync(newPassword, 10);
        await Users.findByIdAndUpdate(
            userId,
            {
                password: hashPassword,
            },
            { timestamps: true }
        );
        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Cập nhật mật khẩu thành công",
        });
    } catch (error) {
        console.error("Lỗi khi cập nhật mật khẩu:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

export { getAllUsers, updateUserStatus, deleteCustomer, adminUpdateInfo, adminUpdatePassword, userUpdateInfo, userUpdatePassword, userCreatePassword };
