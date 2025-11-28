/** @format */

import mongoose, { Schema, Document } from "mongoose";

export interface IReview extends Document {
    userId?: mongoose.Types.ObjectId;
    guestInfo?: {
        displayName: string;
        email: string;
        phoneNumber?: string;
    };
    rating: number;
    comment: string;
    userType: "user" | "guest";
    isPin: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const reviewSchema = new Schema<IReview>(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, required: false, ref: "Users" },
        guestInfo: {
            displayName: { type: String, required: false },
            email: { type: String, required: false },
            phoneNumber: { type: String, required: false },
        },
        rating: { type: Number, required: true, min: 1, max: 5 },
        comment: { type: String, required: true },
        userType: { type: String, enum: ["user", "guest"], required: true },
        isPin: { type: Boolean, default: false },
    },
    { timestamps: true }
);

const Reviews = mongoose.model<IReview>("Reviews", reviewSchema);

export default Reviews;
