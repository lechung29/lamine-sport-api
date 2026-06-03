/** @format */

import { Request, RequestHandler, Response } from "express";
import { AuthenticatedRequest } from "../middlewares/auth";
import Users, { IResponseStatus } from "../models/users/users.model";
import Products, { ProductType } from "../models/products/products.model";
import Orders, { OrderStatus } from "../models/orders/orders.model";
import { generateUniqueOrderCode, validateStatusTransition } from "../utils";
import Coupons, { CouponStatus } from "../models/coupons/coupon.model";
import { buildSePayQrUrl, buildSePayContent, verifySePayWebhook, SePayWebhookPayload } from "../config/sepay";
import { IOrderPayment, PaymentStatus } from "../models/orders/orders.model";

const restoreOrderInventory = async (order: any) => {
    const restoreOperations: any[] = [];

    for (const item of order.orderItems) {
        restoreOperations.push({
            updateOne: {
                filter: {
                    _id: item.product._id ?? item.product,
                    "productColors.value": item.selectedColor,
                },
                update: {
                    $inc: {
                        "productColors.$.quantity": +item.quantity,
                        "productColors.$.sale": -item.quantity,
                        stockQuantity: +item.quantity,
                        saleQuantity: -item.quantity,
                    },
                },
            },
        });
    }

    if (restoreOperations.length > 0) {
        await Products.bulkWrite(restoreOperations);
    }
};

const sePayWebhook: RequestHandler = async (req: Request, res: Response) => {
    try {
        console.log("Received SePay webhook:", req.body);
        const authHeader = (req.headers["authorization"] || "") as string;
        const apiKey = authHeader.startsWith("Apikey ") ? authHeader.slice("Apikey ".length).trim() : authHeader.trim();

        if (!verifySePayWebhook(apiKey)) {
            console.warn("SePay webhook: Unauthorized request, apiKey không khớp");
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const payload: SePayWebhookPayload = req.body;

        if (payload.transferType !== "in") {
            return res.status(200).json({ success: true, message: "Ignored outgoing transfer" });
        }

        const content = (payload.content || payload.description || "").toUpperCase().trim();

        const orderCodeMatch = content.match(/LAMINE\s+SPORT\s+([A-Z0-9]+)/i);
        if (!orderCodeMatch) {
            console.log(`SePay webhook: Không tìm thấy orderCode trong nội dung: "${content}"`);
            return res.status(200).json({ success: true, message: "No order code in content" });
        }

        const orderCode = orderCodeMatch[1].toUpperCase();

        const matchedOrder = await Orders.findOne({
            orderCode,
            paymentMethod: IOrderPayment.Transfer,
            paymentStatus: PaymentStatus.Pending,
        }).select("orderCode totalPrice paymentStatus _id");

        if (!matchedOrder) {
            console.log(`SePay webhook: Không tìm thấy đơn pending với orderCode "${orderCode}"`);
            return res.status(200).json({ success: true, message: "No matching order found" });
        }

        if (Number(payload.transferAmount) < Number(matchedOrder.totalPrice)) {
            console.warn(`SePay: Số tiền không khớp cho đơn ${matchedOrder.orderCode}. Nhận: ${payload.transferAmount}, Cần: ${matchedOrder.totalPrice}`);
            return res.status(200).json({ success: true, message: "Amount mismatch, ignored" });
        }

        await Orders.findByIdAndUpdate(matchedOrder._id, {
            paymentStatus: PaymentStatus.Paid,
            orderStatus: OrderStatus.Processing,
            paidAt: new Date(),
            transactionRef: String(payload.id || payload.referenceCode || ""),
        });

        console.log(`SePay: Đơn hàng ${matchedOrder.orderCode} đã thanh toán thành công.`);

        return res.status(200).json({ success: true, message: "Payment confirmed" });
    } catch (error) {
        console.error("Lỗi SePay Webhook:", error);
        return res.status(200).json({ success: false, message: "Internal error" });
    }
};

const checkPaymentStatus: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { orderCode } = req.params;
        const userId = req.user?.id;

        const order = await Orders.findOne({ orderCode, userId });

        if (!order) {
            return res.status(404).json({
                status: IResponseStatus.Error,
                message: "Không tìm thấy đơn hàng",
            });
        }

        return res.status(200).json({
            status: IResponseStatus.Success,
            message: "Lấy trạng thái thanh toán thành công",
            data: {
                orderCode: order.orderCode,
                paymentStatus: order.paymentStatus,
                orderStatus: order.orderStatus,
                paidAt: order.paidAt,
            },
        });
    } catch (error) {
        return res.status(500).json({
            status: IResponseStatus.Error,
            message: "Lỗi khi kiểm tra trạng thái thanh toán",
        });
    }
};

const createOrder: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
    const { orderItems, shippingInfo, paymentMethod, productsFees, shippingFees, discountValue, totalPrice, couponCode } = req.body;

    if (orderItems && orderItems.length === 0) {
        return res.status(400).send({
            status: IResponseStatus.Error,
            message: "Không có sản phẩm trong giỏ hàng",
        });
    }

    let appliedCoupon = null;
    if (couponCode) {
        appliedCoupon = await Coupons.findOne({ couponCode });

        if (!appliedCoupon) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "Mã giảm giá không tồn tại",
            });
        }

        if (appliedCoupon.couponStatus !== CouponStatus.Active) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "Mã giảm giá không còn hiệu lực",
            });
        }

        const now = new Date();
        if (now < appliedCoupon.startDate || now > appliedCoupon.endDate) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "Mã giảm giá đã hết hạn hoặc chưa đến thời gian sử dụng",
            });
        }

        if (appliedCoupon.usedQuantity >= appliedCoupon.couponQuantity) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "Mã giảm giá đã hết lượt sử dụng",
            });
        }
    }

    const validatedOrderItems = [];
    const updateOperations = [];

    for (const item of orderItems) {
        const product = await Products.findById(item.product._id ?? item.product);
        if (!product) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: `Sản phẩm với ID ${item.productId} không tồn tại`,
            });
        }

        const selectedColor = product.productColors?.find((color) => color.value === item.selectedColor);
        if (!selectedColor) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: `Sản phẩm ${product.productName} không có biến thể màu này.`,
            });
        }

        if (selectedColor.quantity < item.quantity) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: `Sản phẩm ${product.productName} (${selectedColor.name}) không đủ hàng tồn kho.`,
            });
        }

        validatedOrderItems.push({
            product: product._id,
            selectedSize: item.selectedSize,
            selectedColor: selectedColor.value,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
        });

        updateOperations.push({
            updateOne: {
                filter: {
                    _id: product._id,
                    "productColors.value": item.selectedColor,
                },
                update: {
                    $inc: {
                        "productColors.$.quantity": -item.quantity,
                        "productColors.$.sale": +item.quantity,
                        stockQuantity: -item.quantity,
                        saleQuantity: +item.quantity,
                    },
                },
            },
        });
    }

    const orderCode = await generateUniqueOrderCode();

    const order = new Orders({
        userId: req.user?.id,
        orderCode,
        orderItems: validatedOrderItems,
        shippingInfo,
        paymentMethod,
        paymentStatus: paymentMethod === IOrderPayment.Transfer ? PaymentStatus.PendingPayment : PaymentStatus.Pending,
        totalPrice,
        productsFees,
        shippingFees,
        discountValue,
        orderStatus: OrderStatus.WaitingConfirm,
        couponCode: appliedCoupon ? appliedCoupon.couponCode : null,
    });

    const createdOrder = await order.save();
    await Products.bulkWrite(updateOperations);

    if (appliedCoupon) {
        await Coupons.findByIdAndUpdate(appliedCoupon._id, {
            $inc: { usedQuantity: 1 },
        });
    }

    const responseData: any = {
        order: createdOrder,
    };

    if (paymentMethod === IOrderPayment.Transfer) {
        const qrUrl = buildSePayQrUrl({
            amount: totalPrice,
            orderCode,
        });

        responseData.qrUrl = qrUrl;
        responseData.orderCode = orderCode;
        responseData.transferContent = buildSePayContent(orderCode);
        responseData.bankInfo = {
            bankCode: process.env.SEPAY_BANK_CODE,
            accountNumber: process.env.SEPAY_ACCOUNT_NUMBER,
            accountName: process.env.SEPAY_ACCOUNT_NAME,
        };
    }

    return res.status(201).send({
        status: IResponseStatus.Success,
        message: paymentMethod === IOrderPayment.Transfer ? "Đã tạo đơn hàng, vui lòng quét mã QR để thanh toán" : "Đặt đơn hàng thành công!",
        data: responseData,
    });
};

const getMyOrders: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "Không tìm thấy ID người dùng. Vui lòng đăng nhập lại.",
            });
        }

        const orders = await Orders.find({ userId: userId })
            .populate({
                path: "orderItems.product",
                model: "Products",
            })
            .sort({ createdAt: -1 });

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy danh sách đơn hàng thành công!",
            data: orders,
        });
    } catch (error) {
        console.error("Lỗi khi lấy đơn hàng của người dùng:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const cancelOrder: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { orderId } = req.params;
        const userId = req.user?.id;

        const order = await Orders.findById(orderId);

        if (!order) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Không tìm thấy đơn hàng",
            });
        }

        if (order.userId.toString() !== userId) {
            return res.status(403).send({
                status: IResponseStatus.Error,
                message: "Bạn không có quyền hủy đơn hàng này",
            });
        }

        if (order.orderStatus !== OrderStatus.WaitingConfirm) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "Chỉ có thể hủy đơn hàng đang chờ xác nhận",
            });
        }

        await restoreOrderInventory(order);

        await Orders.findByIdAndUpdate(orderId, {
            orderStatus: OrderStatus.Cancel,
            paymentStatus: order.paymentStatus === PaymentStatus.Pending ? PaymentStatus.Cancelled : order.paymentStatus,
        });

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Hủy đơn hàng thành công",
        });
    } catch (error) {
        console.error("Lỗi khi hủy đơn hàng:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const getAllOrders: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { search, page = "1", limit = "9", ...filters } = req.query;
        const convertPage = parseInt(page as string);
        const convertLimit = parseInt(limit as string);

        const mongoFilter: { [key: string]: any } = {};
        for (const key in filters) {
            const value = filters[key];
            if (value) {
                if (key === "orderStatus" || key === "paymentMethod") {
                    if (Array.isArray(value)) {
                        mongoFilter[key] = { $in: value.map((v) => parseInt(v as string)) };
                    } else {
                        mongoFilter[key] = parseInt(value as string);
                    }
                } else {
                    mongoFilter[key] = { $in: Array.isArray(value) ? value : [value] };
                }
            }
        }

        const skip = (convertPage - 1) * convertLimit;
        const pipeline: any[] = [
            { $match: mongoFilter },
            {
                $lookup: {
                    from: "users",
                    localField: "userId",
                    foreignField: "_id",
                    as: "userInfo",
                },
            },
            {
                $unwind: {
                    path: "$userInfo",
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $lookup: {
                    from: "products",
                    localField: "orderItems.product",
                    foreignField: "_id",
                    as: "productDetails",
                },
            },
            ...(search
                ? [
                      {
                          $match: {
                              $or: [{ orderCode: { $regex: search, $options: "i" } }, { "userInfo.displayName": { $regex: search, $options: "i" } }],
                          },
                      },
                  ]
                : []),
            { $sort: { createdAt: -1 } },
            {
                $facet: {
                    data: [{ $skip: skip }, { $limit: convertLimit }],
                    totalCounts: [{ $count: "count" }],
                },
            },
        ];

        const result = await Orders.aggregate(pipeline);
        const orders = result[0]?.data || [];
        const totalCounts = result[0]?.totalCounts[0]?.count || 0;

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy danh sách đơn hàng thành công",
            data: { orders, totalCounts },
        });
    } catch (error) {
        console.error("Lỗi khi lấy tất cả đơn hàng:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống",
        });
    }
};

const updateOrdersStatus: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { orderCodes, newStatus } = req.body;

        if (!orderCodes || !Array.isArray(orderCodes) || orderCodes.length === 0) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "Danh sách mã đơn hàng không hợp lệ",
            });
        }

        const orders = await Orders.find({ orderCode: { $in: orderCodes } });

        for (const order of orders) {
            const isValid = validateStatusTransition(order.orderStatus, newStatus);
            if (!isValid) {
                return res.status(400).send({
                    status: IResponseStatus.Error,
                    message: `Không thể chuyển trạng thái đơn hàng ${order.orderCode}`,
                });
            }
        }

        const updateData: any = { orderStatus: newStatus };
        if (newStatus === OrderStatus.Cancel) {
            for (const order of orders) {
                await restoreOrderInventory(order);
            }
        }

        await Orders.updateMany({ orderCode: { $in: orderCodes } }, updateData);

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Cập nhật trạng thái đơn hàng thành công",
        });
    } catch (error) {
        console.error("Lỗi khi cập nhật trạng thái đơn hàng:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống",
        });
    }
};

const getDetailsOrder: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { orderId } = req.params;

        const order = await Orders.findById(orderId).populate({
            path: "orderItems.product",
            model: "Products",
        });

        if (!order) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Không tìm thấy đơn hàng",
            });
        }

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy chi tiết đơn hàng thành công",
            data: order,
        });
    } catch (error) {
        console.error("Lỗi khi lấy chi tiết đơn hàng:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống",
        });
    }
};

const getDashboardStats: RequestHandler = async (req: Request, res: Response) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        const monthlyOrdersCount = await Orders.countDocuments({
            createdAt: { $gte: startOfMonth, $lte: endOfMonth },
            orderStatus: { $ne: OrderStatus.Cancel },
        });

        const lastMonthOrdersCount = await Orders.countDocuments({
            createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
            orderStatus: { $ne: OrderStatus.Cancel },
        });

        const ordersPercentageChange = lastMonthOrdersCount > 0 ? ((monthlyOrdersCount - lastMonthOrdersCount) / lastMonthOrdersCount) * 100 : 100;

        const currentMonthRevenueData = await Orders.aggregate([
            { $match: { createdAt: { $gte: startOfMonth, $lte: endOfMonth }, orderStatus: { $ne: OrderStatus.Cancel } } },
            { $group: { _id: null, totalRevenue: { $sum: "$totalPrice" } } },
        ]);
        const currentMonthRevenue = currentMonthRevenueData[0]?.totalRevenue || 0;

        const lastMonthRevenue = await Orders.aggregate([
            { $match: { createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth }, orderStatus: { $ne: OrderStatus.Cancel } } },
            { $group: { _id: null, totalRevenue: { $sum: "$totalPrice" } } },
        ]);
        const previousMonthRevenue = lastMonthRevenue[0]?.totalRevenue || 0;
        const revenuePercentageChange = previousMonthRevenue > 0 ? ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100 : 100;

        const todayRevenue = await Orders.aggregate([
            { $match: { createdAt: { $gte: startOfToday, $lte: endOfToday }, orderStatus: { $ne: OrderStatus.Cancel } } },
            { $group: { _id: null, totalRevenue: { $sum: "$totalPrice" } } },
        ]);

        const monthlyNewUsers = await Users.countDocuments({ createdAt: { $gte: startOfMonth, $lte: endOfMonth }, role: "user" });
        const lastMonthNewUsers = await Users.countDocuments({ createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth }, role: "user" });
        const usersPercentageChange = lastMonthNewUsers > 0 ? ((monthlyNewUsers - lastMonthNewUsers) / lastMonthNewUsers) * 100 : 100;

        const waitingConfirmOrders = await Orders.countDocuments({ orderStatus: OrderStatus.WaitingConfirm });
        const processingOrders = await Orders.countDocuments({ orderStatus: OrderStatus.Processing });

        const productTypeRevenue = await Orders.aggregate([
            { $match: { orderStatus: { $ne: OrderStatus.Cancel } } },
            { $unwind: "$orderItems" },
            { $lookup: { from: "products", localField: "orderItems.product", foreignField: "_id", as: "productDetails" } },
            { $unwind: "$productDetails" },
            { $group: { _id: { year: { $year: "$createdAt" }, productType: "$productDetails.productType" }, revenue: { $sum: { $multiply: ["$orderItems.quantity", "$orderItems.unitPrice"] } } } },
            { $sort: { "_id.year": 1, "_id.productType": 1 } },
        ]);

        const getProductTypeName = (type: number): string => {
            const typeNames: { [key: number]: string } = {
                [ProductType.Shoes]: "Giày",
                [ProductType.TShirt]: "Áo",
                [ProductType.Shorts]: "Quần",
                [ProductType.Skirt]: "Váy",
                [ProductType.Accessory]: "Phụ kiện",
            };
            return typeNames[type] || "Khác";
        };

        const revenueByYear: { [key: number]: { productType: string; revenue: number }[] } = {};
        productTypeRevenue.forEach((item) => {
            const year = item._id.year;
            if (!revenueByYear[year]) revenueByYear[year] = [];
            revenueByYear[year].push({ productType: getProductTypeName(item._id.productType), revenue: Math.round(item.revenue) });
        });

        const productTypeRevenueByYear = Object.keys(revenueByYear)
            .map((year) => ({ year: parseInt(year), data: revenueByYear[parseInt(year)] }))
            .sort((a, b) => a.year - b.year);

        const currentYear = now.getFullYear();
        const topProducts = await Orders.aggregate([
            { $match: { createdAt: { $gte: new Date(currentYear, 0, 1), $lte: new Date(currentYear, 11, 31, 23, 59, 59) }, orderStatus: { $ne: OrderStatus.Cancel } } },
            { $unwind: "$orderItems" },
            { $group: { _id: "$orderItems.product", totalQuantity: { $sum: "$orderItems.quantity" }, totalRevenue: { $sum: { $multiply: ["$orderItems.quantity", "$orderItems.unitPrice"] } } } },
            { $sort: { totalQuantity: -1 } },
            { $limit: 5 },
            { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "productDetails" } },
            { $unwind: "$productDetails" },
            { $project: { productId: "$_id", productName: "$productDetails.productName", totalQuantitySold: "$totalQuantity", totalRevenue: "$totalRevenue" } },
        ]);

        const totalQuantityAllTop = topProducts.reduce((sum, p) => sum + p.totalQuantitySold, 0);
        const topSellingProducts = topProducts.map((product) => ({
            productId: product.productId.toString(),
            productName: product.productName,
            totalQuantitySold: product.totalQuantitySold,
            totalRevenue: Math.round(product.totalRevenue),
            percentage: Math.round((product.totalQuantitySold / totalQuantityAllTop) * 100 * 100) / 100,
        }));

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy thông tin dashboard thành công",
            data: {
                monthlyOrders: { total: monthlyOrdersCount, percentageChange: Math.round(ordersPercentageChange * 100) / 100 },
                salesPerformance: { totalRevenue: currentMonthRevenue, percentageChange: Math.round(revenuePercentageChange * 100) / 100 },
                todayRevenue: todayRevenue[0]?.totalRevenue || 0,
                monthlyNewUsers: { total: monthlyNewUsers, percentageChange: Math.round(usersPercentageChange * 100) / 100 },
                pendingOrders: { waitingConfirm: waitingConfirmOrders, processing: processingOrders, total: waitingConfirmOrders + processingOrders },
                productTypeRevenueByYear,
                topSellingProducts,
            },
        });
    } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Lỗi khi lấy thông tin dashboard",
        });
    }
};

export { createOrder, getMyOrders, cancelOrder, getAllOrders, updateOrdersStatus, getDetailsOrder, getDashboardStats, sePayWebhook, checkPaymentStatus };
