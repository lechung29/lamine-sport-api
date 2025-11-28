/** @format */

import mongoose, { Document } from "mongoose";

export enum DiscountApplyType {
    AllProducts = 1,
    SpecificProducts = 2,
}

export enum DiscountStatus {
    Scheduled = 1,
    Active = 2,
    Expired = 3,
    Cancelled = 4,
}

export enum ApplySetting {
    AlwaysApply = 1,
    ApplyWithCondition = 2,
}

export interface IDiscountProgram extends Document {
    programName: string;
    discountPercentage: number;
    applyType: DiscountApplyType;
    productIds?: mongoose.Types.ObjectId[];
    startDate: Date;
    endDate: Date;
    status: DiscountStatus;
    createdAt?: Date;
    applySetting: ApplySetting;
}

export const discountSchema = new mongoose.Schema<IDiscountProgram>(
    {
        programName: {
            type: String,
            required: true,
            index: true,
        },
        discountPercentage: {
            type: Number,
            required: true,
            min: 0,
        },
        applyType: {
            type: Number,
            required: true,
            enum: DiscountApplyType,
        },
        productIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                required: true,
                ref: "Products",
            }
        ],
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },
        status: {
            type: Number,
            required: true,
            enum: DiscountStatus,
        },
        applySetting: {
            type: Number,
            required: true,
            enum: ApplySetting,
        },
    },
    { timestamps: true }
);

const DiscountProgram = mongoose.model("Discounts", discountSchema);

export default DiscountProgram;
