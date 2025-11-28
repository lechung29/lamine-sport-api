/** @format */

import { Request, RequestHandler, Response } from "express";
import Coupons, { CouponStatus } from "../models/coupons/coupon.model";
import { IResponseStatus } from "../models/users/users.model";
import Orders, { OrderStatus } from "../models/orders/orders.model";

const createNewCoupon: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { couponCode, discountType, discountValue, maxValue, startDate, endDate, couponQuantity } = req.body;

        const existingCoupon = await Coupons.findOne({ couponCode });
        if (existingCoupon) {
            return res.status(409).send({
                status: IResponseStatus.Error,
                message: "Mã coupon đã tồn tại",
            });
        }

        const now = new Date();
        let couponStatus = CouponStatus.Active;
        if (new Date(startDate) > now) {
            couponStatus = CouponStatus.Schedule;
        }

        const newCoupon = new Coupons({
            couponCode,
            valueType: discountType,
            value: discountValue,
            maxValue,
            startDate: startDate,
            endDate: endDate,
            couponQuantity,
            couponStatus,
            usedQuantity: 0,
        });

        await newCoupon.save();

        return res.status(201).send({
            status: IResponseStatus.Success,
            message: "Coupon đã được tạo thành công!",
        });
    } catch (error) {
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const getCoupons: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { sort, search, page = "1", limit = "9", ...filters } = req.query;

        const convertPage = parseInt(page as string);
        const convertLimit = parseInt(limit as string);

        const mongoFilter: { [key: string]: Object } = {};
        for (const key in filters) {
            const value = filters[key];
            mongoFilter[key] = { $in: Array.isArray(value) ? value : [value] };
        }

        if (search) {
            mongoFilter.couponCode = { $regex: search, $options: "i" };
        }

        const skip = (convertPage - 1) * convertLimit;
        let query = Coupons.find(mongoFilter);
        const coupons = await query.skip(skip).limit(convertLimit);
        const totalCounts = await Coupons.countDocuments(mongoFilter);
        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy sản phẩm thành công",
            data: {
                coupons,
                totalCounts,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const updateCoupon: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { couponCode, discountType, discountValue, maxValue, startDate, endDate, couponQuantity } = req.body;

        const existingCoupon = await Coupons.findOne({ couponCode });
        if (!existingCoupon) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Mã coupon không tồn tại",
            });
        }

        existingCoupon.valueType = discountType ?? existingCoupon.valueType;
        existingCoupon.value = discountValue ?? existingCoupon.value;
        existingCoupon.maxValue = maxValue ?? existingCoupon.maxValue;
        existingCoupon.startDate = startDate ?? existingCoupon.startDate;
        existingCoupon.endDate = endDate ?? existingCoupon.endDate;
        existingCoupon.couponQuantity = couponQuantity ?? existingCoupon.couponQuantity;

        const now = new Date();
        const newStartDate = new Date(existingCoupon.startDate);
        if (newStartDate > now) {
            existingCoupon.couponStatus = CouponStatus.Schedule;
        } else {
            existingCoupon.couponStatus = CouponStatus.Active;
        }

        const newEndDate = new Date(existingCoupon.endDate);
        if (newEndDate < now) {
            existingCoupon.couponStatus = CouponStatus.Expired;
        }

        await existingCoupon.save();

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Coupon đã được cập nhật thành công!",
        });
    } catch (error) {
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const deleteCoupon: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { couponCode } = req.params;

        const deletedCoupon = await Coupons.findOneAndDelete({ couponCode });

        if (!deletedCoupon) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Mã coupon không tồn tại",
            });
        }

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Coupon đã được xóa thành công!",
        });
    } catch (error) {
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const applyCoupon: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { couponCode, userId } = req.body;

        const coupon = await Coupons.findOne({ couponCode });

        if (!coupon) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "Mã coupon không tồn tại.",
            });
        }

        const now = new Date();

        if (coupon.couponStatus === CouponStatus.Expired) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "Mã coupon đã hết hạn.",
            });
        }

        if (now.getTime() < coupon.startDate.getTime()) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "Mã coupon chưa đến thời gian sử dụng.",
            });
        }

        if (now.getTime() > coupon.endDate.getTime()) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "Mã coupon đã hết hạn.",
            });
        }

        if (coupon.usedQuantity >= coupon.couponQuantity) {
            if (coupon.couponStatus !== CouponStatus.OutOfUsed) {
                await Coupons.updateOne({ _id: coupon._id }, { couponStatus: CouponStatus.OutOfUsed });
            }

            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "Mã coupon đã hết lượt sử dụng.",
            });
        }

        if (userId) {
            const orders = await Orders.find({ couponCode: coupon.couponCode, orderStatus: { $ne: OrderStatus.Cancel } }).lean();
            if (orders && orders.length > 0) {
                const ordersByUserId = orders.find((order) => order.userId.toString() === userId);
                if (ordersByUserId) {
                    return res.status(400).send({
                        status: IResponseStatus.Error,
                        message: "Bạn đã sử dụng mã giảm giá này rồi.",
                    });
                }
            }
        }

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Áp dụng mã giảm giá thành công!",
            data: coupon,
        });
    } catch (error) {
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};
export { createNewCoupon, getCoupons, updateCoupon, deleteCoupon, applyCoupon };
