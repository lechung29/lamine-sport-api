/** @format */

import mongoose, { Document } from "mongoose";

export interface IPasswordRecoveryToken extends Document {
    token: string;
    customerEmail: string;
    createdAt: Date;
}

const passwordRecoveryTokenSchema = new mongoose.Schema<IPasswordRecoveryToken>({
    token: {
        type: String,
        required: true,
    },
    customerEmail: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: "5m",
    },
});

const PRTokens = mongoose.model<IPasswordRecoveryToken>("PRTokens", passwordRecoveryTokenSchema);

export default PRTokens;
