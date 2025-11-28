/** @format */

import mongoose from "mongoose";

export enum CouponValueType {
    FixedAmount = 1,
    Percent,
}

export enum CouponStatus {
    Active = 1,
    Expired,
    Schedule,
    OutOfUsed,
}

export interface ICouponData {
    couponCode: string;
    valueType: CouponValueType;
    value: number;
    maxValue?: number;
    couponStatus: CouponStatus;
    startDate: Date;
    endDate: Date;
    couponQuantity: number;
    usedQuantity: number;
}

const couponSchema = new mongoose.Schema<ICouponData>(
    {
        couponCode: {
            type: String,
            required: true,
            index: true,
        },
        valueType: {
            type: Number,
            required: true,
            enum: CouponValueType,
        },
        value: {
            type: Number,
            required: true,
        },
        maxValue: {
            type: Number,
            required: false,
        },
        couponStatus: {
            type: Number,
            enum: CouponStatus,
        },
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },
        couponQuantity: {
            type: Number,
            required: true,
        },
        usedQuantity: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

const Coupons = mongoose.model("Coupons", couponSchema);

export default Coupons;
