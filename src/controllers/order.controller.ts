/** @format */

import { Request, RequestHandler, Response } from "express";
import { AuthenticatedRequest } from "../middlewares/auth";
import Users, { IResponseStatus } from "../models/users/users.model";
import Products, { ProductType } from "../models/products/products.model";
import Orders, { OrderStatus } from "../models/orders/orders.model";
import { generateUniqueOrderCode, validateStatusTransition } from "../utils";
import Coupons, { CouponStatus } from "../models/coupons/coupon.model";

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
        const product = await Products.findById(item.product._id);
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

    const order = new Orders({
        userId: req.user?.id,
        orderCode: await generateUniqueOrderCode(),
        orderItems: validatedOrderItems,
        shippingInfo,
        paymentMethod,
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

    return res.status(201).send({
        status: IResponseStatus.Success,
        message: "Đặt đơn hàng thành công!",
        data: createdOrder,
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

            {
                $addFields: {
                    orderItems: {
                        $map: {
                            input: "$orderItems",
                            as: "item",
                            in: {
                                $mergeObjects: [
                                    "$$item",
                                    {
                                        product: {
                                            $arrayElemAt: [
                                                {
                                                    $filter: {
                                                        input: "$productDetails",
                                                        cond: { $eq: ["$$this._id", "$$item.product"] },
                                                    },
                                                },
                                                0,
                                            ],
                                        },
                                    },
                                ],
                            },
                        },
                    },
                    userId: "$userId",
                },
            },
            { $sort: { createdAt: -1 } },
        ];

        const countPipeline = [...pipeline, { $count: "total" }];
        const countResult = await Orders.aggregate(countPipeline);
        const totalCounts = countResult.length > 0 ? countResult[0].total : 0;

        pipeline.push(
            { $skip: skip },
            { $limit: convertLimit },
            {
                $project: {
                    productDetails: 0,
                    "userInfo.password": 0,
                    "userInfo.refreshToken": 0,
                    "userInfo.__v": 0,
                },
            }
        );

        const orders = await Orders.aggregate(pipeline);

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy thông tin đơn hàng thành công",
            data: {
                orders,
                totalCounts,
            },
        });
    } catch (error) {
        console.error("Lỗi khi lấy danh sách đơn hàng:", error);
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

        if (!userId) {
            return res.status(401).send({
                status: IResponseStatus.Error,
                message: "Không tìm thấy ID người dùng. Vui lòng đăng nhập lại.",
            });
        }

        if (!orderId) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "ID đơn hàng là bắt buộc.",
            });
        }

        const order = await Orders.findOne({ orderCode: orderId, userId: userId }).populate({
            path: "orderItems.product",
            model: "Products",
        });

        if (!order) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Không tìm thấy đơn hàng hoặc bạn không có quyền hủy đơn hàng này.",
            });
        }

        const cancelableStatuses = [OrderStatus.WaitingConfirm];
        if (!cancelableStatuses.includes(order.orderStatus)) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "Đơn hàng đã được xác nhận và đang giao hàng, không thể hủy",
            });
        }

        if (order.orderStatus === OrderStatus.Cancel) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "Đơn hàng này đã được hủy trước đó.",
            });
        }

        const restoreOperations = [];

        for (const item of order.orderItems) {
            const product = await Products.findById(item.product._id);
            if (product) {
                restoreOperations.push({
                    updateOne: {
                        filter: {
                            _id: item.product._id,
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
        }

        await Orders.findOneAndUpdate(
            {
                orderCode: orderId,
            },
            {
                orderStatus: OrderStatus.Cancel,
            },
            { new: true }
        ).populate({
            path: "orderItems.product",
            model: "Products",
        });

        if (restoreOperations.length > 0) {
            await Products.bulkWrite(restoreOperations);
        }

        if (order.couponCode) {
            const coupon = await Coupons.findOne({ couponCode: order.couponCode });
            if (coupon && coupon.usedQuantity > 0) {
                await Coupons.findByIdAndUpdate(coupon._id, {
                    $inc: { usedQuantity: -1 },
                });
            }
        }

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Hủy đơn hàng thành công!",
        });
    } catch (error) {
        console.error("Lỗi khi hủy đơn hàng:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const updateOrdersStatus: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { orderCodes, newStatus } = req.body;

        if (!orderCodes || !Array.isArray(orderCodes) || orderCodes.length === 0) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "Danh sách mã đơn hàng là bắt buộc và phải là một mảng không rỗng.",
            });
        }

        if (!newStatus || !Object.values(OrderStatus).includes(newStatus)) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "Trạng thái đơn hàng không hợp lệ.",
            });
        }

        const orders = await Orders.find({
            orderCode: { $in: orderCodes },
        }).populate({
            path: "orderItems.product",
            model: "Products",
        });

        if (orders.length === 0) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Không tìm thấy đơn hàng nào với các mã đơn hàng được cung cấp.",
            });
        }

        const validUpdates = [];
        const invalidUpdates = [];
        const inventoryOperations = [];
        const couponCodesToRestore = [];

        for (const order of orders) {
            const statusTransition = validateStatusTransition(order.orderStatus, newStatus);

            if (!statusTransition.isValid) {
                invalidUpdates.push({
                    orderCode: order.orderCode,
                    currentStatus: order.orderStatus,
                });
                continue;
            }

            validUpdates.push(order.orderCode);

            if (newStatus === OrderStatus.Cancel && order.orderStatus !== OrderStatus.Cancel) {
                for (const item of order.orderItems) {
                    const product = await Products.findById(item.product._id);
                    if (product) {
                        inventoryOperations.push({
                            updateOne: {
                                filter: {
                                    _id: item.product._id,
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
                }

                if (order.couponCode) {
                    couponCodesToRestore.push(order.couponCode);
                }
            }
        }

        let updatedCount = 0;
        if (validUpdates.length > 0) {
            const updateResult = await Orders.updateMany(
                { orderCode: { $in: validUpdates } },
                {
                    orderStatus: newStatus,
                    updatedAt: new Date(),
                }
            );
            updatedCount = updateResult.modifiedCount;

            if (inventoryOperations.length > 0) {
                await Products.bulkWrite(inventoryOperations);
            }

            if (couponCodesToRestore.length > 0) {
                const uniqueCouponCodes = [...new Set(couponCodesToRestore)];

                for (const couponCode of uniqueCouponCodes) {
                    const countToRestore = couponCodesToRestore.filter((code) => code === couponCode).length;
                    const coupon = await Coupons.findOne({ couponCode });

                    if (coupon && coupon.usedQuantity >= countToRestore) {
                        await Coupons.findByIdAndUpdate(coupon._id, {
                            $inc: { usedQuantity: -countToRestore },
                        });
                    }
                }
            }
        }

        const response: any = {
            status: IResponseStatus.Success,
            message: `Cập nhật trạng thái thành công cho ${updatedCount} đơn hàng.`,
        };

        return res.status(200).send(response);
    } catch (error) {
        console.error("Lỗi khi cập nhật trạng thái đơn hàng:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const getDetailsOrder: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { orderId } = req.params;

        const orderInfo = await Orders.findOne({ orderCode: orderId })
            .populate({
                path: "orderItems.product",
                model: "Products",
            })
            .populate({
                path: "userId",
                model: "Users",
                select: "-password -refreshToken",
            })
            .sort({ createdAt: -1 })
            .lean();

        const responseData = !!orderInfo
            ? {
                  ...orderInfo,
                  userInfo: orderInfo?.userId,
                  userId: orderInfo?.userId._id,
              }
            : null;

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy thông tin đơn hàng thành công!",
            data: responseData,
        });
    } catch (error) {
        console.error("Lỗi khi lấy đơn hàng của người dùng:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

interface IDashboardStats {
    monthlyOrders: {
        total: number;
        percentageChange: number;
    };
    salesPerformance: {
        totalRevenue: number;
        percentageChange: number;
    };
    todayRevenue: {
        total: number;
        percentageChange: number;
    };
    monthlyNewUsers: {
        total: number;
        percentageChange: number;
    };
    pendingOrders: {
        waitingConfirm: number;
        processing: number;
        total: number;
    };
    productTypeRevenueByYear: {
        year: number;
        data: {
            productType: string;
            revenue: number;
        }[];
    }[];
    topSellingProducts: {
        productId: string;
        productName: string;
        totalQuantitySold: number;
        totalRevenue: number;
        percentage: number;
    }[];
}

const getDashboardStats: RequestHandler = async (req: Request, res: Response) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        // 1. Số đơn hàng đã nhận trong tháng này
        const monthlyOrdersCount = await Orders.countDocuments({
            createdAt: { $gte: startOfMonth, $lte: endOfMonth },
        });

        const lastMonthOrdersCount = await Orders.countDocuments({
            createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
        });

        const ordersPercentageChange = lastMonthOrdersCount > 0 ? ((monthlyOrdersCount - lastMonthOrdersCount) / lastMonthOrdersCount) * 100 : 100;

        // 2. Hiệu suất bán hàng (doanh số) tháng này
        const monthlyRevenue = await Orders.aggregate([
            {
                $match: {
                    createdAt: { $gte: startOfMonth, $lte: endOfMonth },
                    orderStatus: { $ne: OrderStatus.Cancel },
                },
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$totalPrice" },
                },
            },
        ]);

        const lastMonthRevenue = await Orders.aggregate([
            {
                $match: {
                    createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
                    orderStatus: { $ne: OrderStatus.Cancel },
                },
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$totalPrice" },
                },
            },
        ]);

        const currentMonthRevenue = monthlyRevenue[0]?.totalRevenue || 0;
        const previousMonthRevenue = lastMonthRevenue[0]?.totalRevenue || 0;

        const revenuePercentageChange = previousMonthRevenue > 0 ? ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100 : 100;

        // 3. Doanh số ngày hôm nay
        const todayRevenue = await Orders.aggregate([
            {
                $match: {
                    createdAt: { $gte: startOfToday, $lte: endOfToday },
                    orderStatus: { $ne: OrderStatus.Cancel },
                },
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$totalPrice" },
                },
            },
        ]);

        // 4. Số lượng khách đăng ký tài khoản tháng này
        const monthlyNewUsers = await Users.countDocuments({
            createdAt: { $gte: startOfMonth, $lte: endOfMonth },
            role: "user",
        });

        const lastMonthNewUsers = await Users.countDocuments({
            createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
            role: "user",
        });

        const usersPercentageChange = lastMonthNewUsers > 0 ? ((monthlyNewUsers - lastMonthNewUsers) / lastMonthNewUsers) * 100 : 100;

        // 5. Số lượng đơn hàng đang chờ xử lý và giao hàng
        const waitingConfirmOrders = await Orders.countDocuments({
            orderStatus: OrderStatus.WaitingConfirm,
        });

        const processingOrders = await Orders.countDocuments({
            orderStatus: OrderStatus.Processing,
        });

        // 6. Doanh số các loại sản phẩm qua các năm
        const productTypeRevenue = await Orders.aggregate([
            {
                $match: {
                    orderStatus: { $ne: OrderStatus.Cancel },
                },
            },
            {
                $unwind: "$orderItems",
            },
            {
                $lookup: {
                    from: "products",
                    localField: "orderItems.product",
                    foreignField: "_id",
                    as: "productDetails",
                },
            },
            {
                $unwind: "$productDetails",
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        productType: "$productDetails.productType",
                    },
                    revenue: {
                        $sum: {
                            $multiply: ["$orderItems.quantity", "$orderItems.unitPrice"],
                        },
                    },
                },
            },
            {
                $sort: { "_id.year": 1, "_id.productType": 1 },
            },
        ]);

        // Helper function để chuyển ProductType enum sang tên
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

        // Nhóm dữ liệu theo năm
        const revenueByYear: { [key: number]: { productType: string; revenue: number }[] } = {};

        productTypeRevenue.forEach((item) => {
            const year = item._id.year;
            if (!revenueByYear[year]) {
                revenueByYear[year] = [];
            }
            revenueByYear[year].push({
                productType: getProductTypeName(item._id.productType),
                revenue: Math.round(item.revenue),
            });
        });

        const productTypeRevenueByYear = Object.keys(revenueByYear)
            .map((year) => ({
                year: parseInt(year),
                data: revenueByYear[parseInt(year)],
            }))
            .sort((a, b) => a.year - b.year);

        // 7. Top 5 sản phẩm bán chạy nhất trong năm
        const currentYear = now.getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);

        const topProducts = await Orders.aggregate([
            {
                $match: {
                    createdAt: { $gte: startOfYear, $lte: endOfYear },
                    orderStatus: { $ne: OrderStatus.Cancel },
                },
            },
            {
                $unwind: "$orderItems",
            },
            {
                $group: {
                    _id: "$orderItems.product",
                    totalQuantity: { $sum: "$orderItems.quantity" },
                    totalRevenue: {
                        $sum: {
                            $multiply: ["$orderItems.quantity", "$orderItems.unitPrice"],
                        },
                    },
                },
            },
            {
                $sort: { totalQuantity: -1 },
            },
            {
                $limit: 5,
            },
            {
                $lookup: {
                    from: "products",
                    localField: "_id",
                    foreignField: "_id",
                    as: "productDetails",
                },
            },
            {
                $unwind: "$productDetails",
            },
            {
                $project: {
                    productId: "$_id",
                    productName: "$productDetails.productName",
                    totalQuantitySold: "$totalQuantity",
                    totalRevenue: "$totalRevenue",
                },
            },
        ]);

        // Tính phần trăm cho biểu đồ tròn
        const totalQuantityAllTop = topProducts.reduce((sum, p) => sum + p.totalQuantitySold, 0);

        const topSellingProducts = topProducts.map((product) => ({
            productId: product.productId.toString(),
            productName: product.productName,
            totalQuantitySold: product.totalQuantitySold,
            totalRevenue: Math.round(product.totalRevenue),
            percentage: Math.round((product.totalQuantitySold / totalQuantityAllTop) * 100 * 100) / 100,
        }));

        const dashboardStats: IDashboardStats = {
            monthlyOrders: {
                total: monthlyOrdersCount,
                percentageChange: Math.round(ordersPercentageChange * 100) / 100,
            },
            salesPerformance: {
                totalRevenue: currentMonthRevenue,
                percentageChange: Math.round(revenuePercentageChange * 100) / 100,
            },
            todayRevenue: todayRevenue[0]?.totalRevenue || 0,
            monthlyNewUsers: {
                total: monthlyNewUsers,
                percentageChange: Math.round(usersPercentageChange * 100) / 100,
            },
            pendingOrders: {
                waitingConfirm: waitingConfirmOrders,
                processing: processingOrders,
                total: waitingConfirmOrders + processingOrders,
            },
            productTypeRevenueByYear,
            topSellingProducts,
        };

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy thông tin dashboard thành công",
            data: {
                monthlyOrders: dashboardStats.monthlyOrders,
                salesPerformance: dashboardStats.salesPerformance,
                todayRevenue: dashboardStats.todayRevenue,
                monthlyNewUsers: dashboardStats.monthlyNewUsers,
                pendingOrders: dashboardStats.pendingOrders,
                productTypeRevenueByYear: dashboardStats.productTypeRevenueByYear,
                topSellingProducts: dashboardStats.topSellingProducts,
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

export { createOrder, getMyOrders, cancelOrder, getAllOrders, updateOrdersStatus, getDetailsOrder, getDashboardStats };
