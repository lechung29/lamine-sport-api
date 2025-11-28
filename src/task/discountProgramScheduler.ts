/** @format */

import cron from "node-cron";
import DiscountProgram, { DiscountStatus } from "../models/discounts/discounts.model";

cron.schedule("*/5 * * * *", async () => {
    try {
        const now = new Date();
        await DiscountProgram.updateMany({ endDate: { $lte: now }, status: { $ne: DiscountStatus.Expired } }, { status: DiscountStatus.Expired });
    } catch (error) {
        console.error("Lỗi khi cập nhật status:", error);
    }
});
