/** @format */

import cron from "node-cron";
import Coupons, { CouponStatus } from "../models/coupons/coupon.model";

cron.schedule("0 * * * *", async () => {
    try {
        const now = new Date();

        await Coupons.updateMany(
            {
                endDate: { $lte: now },
                couponStatus: { $ne: CouponStatus.Expired },
            },
            {
                $set: { couponStatus: CouponStatus.Expired },
            }
        );
    } catch (error) {
        console.error("Lỗi khi cập nhật trạng thái:", error);
    }
});
