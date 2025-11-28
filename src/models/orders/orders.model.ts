/** @format */

import mongoose, { Schema, Document } from "mongoose";
import { ProductBasicColor, productSchema } from "../products/products.model";

export enum OrderStatus {
    WaitingConfirm = 1,
    Processing,
    Delivered,
    Cancel,
}

export enum IOrderPayment {
    COD = 1,
    Transfer,
}

export interface IOrderItem extends Document {
    product: mongoose.Types.ObjectId;
    selectedColor: ProductBasicColor;
    selectedSize?: string;
    quantity: number;
    unitPrice: number;
}

export interface IOrder extends Document {
    userId: mongoose.Types.ObjectId;
    orderCode: string;
    orderItems: IOrderItem[];
    totalPrice: number;
    shippingFees: number;
    productsFees: number;
    discountValue?: number;
    couponCode?: string;
    shippingInfo: {
        receiver: string;
        emailReceived: string;
        phoneNumberReceived: string;
        address: string;
        note?: string;
    };
    paymentMethod: IOrderPayment;
    orderStatus: OrderStatus;
}

const orderItemSchema = new Schema<IOrderItem>({
    product: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Products" },
    selectedColor: { type: Number, enum: ProductBasicColor, required: true },
    selectedSize: { type: String, required: false },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
});

const orderSchema = new Schema<IOrder>(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Users" },
        orderCode: { type: String, required: true },
        orderItems: [orderItemSchema],
        shippingInfo: {
            receiver: { type: String, required: true },
            emailReceived: { type: String, required: true },
            phoneNumberReceived: { type: String, required: true },
            address: { type: String, required: true },
            note: { type: String, required: false },
        },
        paymentMethod: { type: Number, enum: IOrderPayment, required: true },
        totalPrice: { type: Number, required: true, default: 0.0 },
        productsFees: { type: Number, required: true },
        shippingFees: { type: Number, required: true },
        discountValue: { type: Number, required: false },
        orderStatus: { type: Number, enum: OrderStatus, required: false },
        couponCode: { type: String, required: false },
    },
    {
        timestamps: true,
    }
);

const Orders = mongoose.model<IOrder>("Orders", orderSchema);

export default Orders;
