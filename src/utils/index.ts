/** @format */

import Orders, { OrderStatus } from "../models/orders/orders.model";

export const generateUniqueOrderCode = async (): Promise<string> => {
    const prefix = "DH_";
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const length = 8;

    let isUnique = false;
    let orderCode = "";

    while (!isUnique) {
        let result = "";
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        orderCode = prefix + result;

        const existingOrder = await Orders.findOne({ orderCode });
        if (!existingOrder) {
            isUnique = true;
        }
    }

    return orderCode;
};

export const validateStatusTransition = (currentStatus: OrderStatus, newStatus: OrderStatus) => {
    const transitions: { [key in OrderStatus]: OrderStatus[] } = {
        [OrderStatus.WaitingConfirm]: [OrderStatus.Processing, OrderStatus.Cancel],
        [OrderStatus.Processing]: [OrderStatus.Delivered, OrderStatus.WaitingConfirm, OrderStatus.Cancel],
        [OrderStatus.Delivered]: [],
        [OrderStatus.Cancel]: [],
    };

    const allowedTransitions = transitions[currentStatus] || [];

    if (currentStatus === newStatus) {
        return {
            isValid: false,
        };
    }

    if (!allowedTransitions.includes(newStatus)) {
        return {
            isValid: false,
        };
    }

    return { isValid: true };
};
