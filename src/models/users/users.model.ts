/** @format */

import mongoose, { Document } from "mongoose";

export enum IResponseStatus {
    Error = 0,
    Success = 1,
}

export enum ICustomerStatus {
    Active = 1,
    Locked,
}

export type IUserInfo = Omit<IUserData, "password">;

export interface IUserData extends Document {
    firstName: string;
    lastName: string;
    displayName: string;
    email: string;
    password: string;
    phoneNumber: string;
    avatar: string;
    address: string;
    role: "admin" | "user";
    status: ICustomerStatus;
    refreshToken: string[];
}

export const defaultAvatar: string = "https://www.pngkey.com/png/full/115-1150420_avatar-png-pic-male-avatar-icon-png.png";

const userSchema = new mongoose.Schema<IUserData>(
    {
        firstName: {
            type: String,
            required: true,
        },
        lastName: {
            type: String,
            required: true,
        },
        displayName: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
        },
        password: {
            type: String,
            required: true,
        },
        phoneNumber: {
            type: String,
            required: false,
        },
        address: {
            type: String,
            required: false,
        },
        avatar: {
            type: String,
            required: false,
            default: defaultAvatar,
        },
        role: {
            type: String,
            required: false,
            default: "user",
        },
        status: {
            type: Number,
            required: false,
            enum: ICustomerStatus,
            default: ICustomerStatus.Active,
        },
        refreshToken: [
            {
                type: String,
                required: false,
                default: [],
            },
        ],
    },
    { timestamps: true }
);

const Users = mongoose.model<IUserData>("Users", userSchema);

export default Users;
