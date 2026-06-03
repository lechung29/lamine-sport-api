/** @format */

import "dotenv/config";
import express from "express";
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

const allowedOrigins = [process.env.CLIENT_URL, "http://localhost:5173", "http://localhost:3000"].filter(Boolean) as string[];
app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin)) return callback(null, true);
            return callback(new Error("Not allowed by CORS"));
        },
        credentials: true,
    }),
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

app.get("/health", (_req, res) => {
    res.status(200).send("OK");
});

app.listen(port, () => {
    console.log(`Server running on port:${port}`);
});
