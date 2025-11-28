/** @format */

import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import { connectDB } from "./config/database";
import authRouter from "./routes/authRoutes";
import productRouter from "./routes/productRoutes";
import userRouter from "./routes/userRoutes";
import couponRouter from "./routes/couponRoutes";
import "./task/couponScheduler";
import "./task/discountProgramScheduler";
import orderRoutes from "./routes/orderRoutes";
import reviewRoutes from "./routes/reviewRoutes";
import discountRoutes from "./routes/discountRoutes";
import searchHistoryRoutes from "./routes/searchHistoryRoutes";
import templateRouter from "./routes/templateRoutes";

const app = express();
dotenv.config();

app.use(express.json());
app.use(
    cors({
        origin: ["https://lamine-sport.vercel.app"],
        credentials: true,
    })
);

app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

const port = process.env.SERVER_PORT || 5000;
connectDB();

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/product", productRouter);
app.use("/api/v1/user", userRouter);
app.use("/api/v1/coupon", couponRouter);
app.use("/api/v1/order", orderRoutes);
app.use("/api/v1/review", reviewRoutes);
app.use("/api/v1/discount", discountRoutes);
app.use("/api/v1/search-history", searchHistoryRoutes);
app.use("/api/v1/template", templateRouter);

//     try {
//         // Kiểm tra thông tin cấu hình VNPay
//         const vnPay = new VNPay({
//             tmnCode: "BRDO0JC4", // Kiểm tra lại TMN Code
//             secureSecret: "BOL0RDCN5A7CVOIOUPWP0KGMEQQ2P9Z9", // Kiểm tra lại Secret Key (thường viết thường)
//             vnpayHost: "https://sandbox.vnpayment.vn",
//             testMode: true, // Đảm bảo đang dùng sandbox
//             hashAlgorithm: HashAlgorithm.SHA512,
//             loggerFn: ignoreLogger,
//         });

//         const now = new Date();
//         const tomorrow = new Date();
//         tomorrow.setDate(now.getDate() + 1);

//         const amount = 50000; // VND

//         const vnp_TxnRef = `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;

//         console.log("🔄 Creating VNPay payment with TxnRef:", vnp_TxnRef);

//         const paymentData = {
//             vnp_Amount: amount,
//             vnp_IpAddr: req.ip || req.connection.remoteAddress || "127.0.0.1",
//             vnp_TxnRef: vnp_TxnRef,
//             vnp_OrderInfo: encodeURIComponent("Thanh toan don hang thu nghiem"), // Encode tiếng Việt
//             vnp_OrderType: ProductCode.Other,
//             vnp_ReturnUrl: "http://localhost:5173/return",
//             vnp_Locale: VnpLocale.VN,
//             vnp_CreateDate: dateFormat(now, "yyyyMMddHHmmss"), // Format chuẩn
//             vnp_ExpireDate: dateFormat(tomorrow, "yyyyMMddHHmmss"),
//             vnp_CurrCode: "VND",
//         };

//         console.log("💰 Payment data:", paymentData);

//         const vnPayResponse = await vnPay.buildPaymentUrl({
//             vnp_Amount: amount,
//             vnp_IpAddr: req.ip || req.connection.remoteAddress || "127.0.0.1",
//             vnp_TxnRef: vnp_TxnRef,
//             vnp_OrderInfo: encodeURIComponent("Thanh toan don hang thu nghiem"), // Encode tiếng Việt
//             vnp_OrderType: ProductCode.Other,
//             vnp_ReturnUrl: "http://localhost:5173/return",
//             vnp_Locale: VnpLocale.VN,
//             vnp_CreateDate: dateFormat(now, "yyyyMMddHHmmss"), // Format chuẩn
//             vnp_ExpireDate: dateFormat(tomorrow, "yyyyMMddHHmmss"),
//             vnp_CurrCode: VnpCurrCode.VND,
//         });

//         console.log("✅ VNPay URL created:", vnPayResponse);

//         return res.status(201).json({
//             success: true,
//             message: "Tạo URL thanh toán thành công",
//             data: {
//                 paymentUrl: vnPayResponse,
//                 txnRef: vnp_TxnRef,
//                 amount: amount,
//                 orderInfo: paymentData.vnp_OrderInfo,
//             },
//         });
//     } catch (error: any) {
//         console.error("❌ VNPay Error:", error);
//         return res.status(500).json({
//             success: false,
//             message: "Lỗi tạo URL thanh toán",
//             error: error.message,
//         });
//     }
// });
app.listen(port, () => {
    console.log(`Server running on port:${port}`);
});


