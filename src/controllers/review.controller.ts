/** @format */

import { Request, RequestHandler, Response } from "express";
import Reviews from "../models/reviews/reviews.model";
import Users, { IResponseStatus } from "../models/users/users.model";
import nodemailer from "nodemailer";

const createReview: RequestHandler = async (req: Request, res: Response) => {
    const { userId, displayName, email, phoneNumber, rating, comment } = req.body;
    try {
        if (userId) {
            const newReview = new Reviews({
                userId,
                rating,
                comment,
                userType: "user",
            });
            await newReview.save();
            return res.status(201).send({
                status: IResponseStatus.Success,
                message: "Gửi đánh giá thành công",
            });
        } else {
            const newReview = new Reviews({
                guestInfo: { displayName, email, phoneNumber },
                rating,
                comment,
                userType: "guest",
            });
            await newReview.save();
            return res.status(201).send({
                status: IResponseStatus.Success,
                message: "Gửi đánh giá thành công",
            });
        }
    } catch (error) {
        console.error("Lỗi khi gửi đánh giá:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const getAllReviews: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { search, page = "1", limit = "9", ...filters } = req.query;
        const convertPage = parseInt(page as string);
        const convertLimit = parseInt(limit as string);

        const mongoFilter: { [key: string]: any } = {};
        for (const key in filters) {
            const value = filters[key];
            if (value) {
                if (key === "rating") {
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
            ...(search
                ? [
                      {
                          $match: {
                              $or: [{ comment: { $regex: search, $options: "i" } }, { "userInfo.displayName": { $regex: search, $options: "i" } }],
                          },
                      },
                  ]
                : []),

            {
                $addFields: {
                    userId: "$userId",
                },
            },
            { $sort: { createdAt: -1 } },
        ];

        const countPipeline = [...pipeline, { $count: "total" }];
        const countResult = await Reviews.aggregate(countPipeline);
        const totalCounts = countResult.length > 0 ? countResult[0].total : 0;

        pipeline.push(
            { $skip: skip },
            { $limit: convertLimit },
            {
                $project: {
                    "userInfo.password": 0,
                    "userInfo.refreshToken": 0,
                    "userInfo.__v": 0,
                },
            }
        );

        const reviews = await Reviews.aggregate(pipeline);

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy thông tin đánh giá thành công",
            data: {
                reviews,
                totalCounts,
            },
        });
    } catch (error) {
        console.error("Lỗi khi lấy danh sách đánh giá:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const deleteReview: RequestHandler = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const review = await Reviews.findById(id);
        if (!review) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Không tìm thấy đánh giá",
            });
        }
        await Reviews.findByIdAndDelete(id);
        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Xoá đánh giá thành công",
        });
    } catch (error) {
        console.error("Lỗi khi xoá đánh giá:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const pinReview: RequestHandler = async (req: Request, res: Response) => {
    const { isPin } = req.body;
    const { id } = req.params;
    try {
        const review = await Reviews.findById(id);
        if (!review) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Không tìm thấy đánh giá",
            });
        }
        await Reviews.findByIdAndUpdate(id, {
            isPin: isPin,
        });
        return res.status(200).send({
            status: IResponseStatus.Success,
            message: isPin ? "Đã ghim đánh giá" : "Đã bỏ ghim đánh giá",
        });
    } catch (error) {
        console.error("Lỗi khi ghim hoặc bỏ ghim đánh giá:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const getPinReview: RequestHandler = async (req: Request, res: Response) => {
    try {
        const pipeline: any[] = [
            { $match: { isPin: true } },
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
                $addFields: {
                    userId: "$userId",
                },
            },
            { $sort: { createdAt: -1 } },
        ];
        const reviews = await Reviews.aggregate(pipeline);
        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy thông tin đánh giá thành công",
            data: reviews,
        });
    } catch (error) {
        console.error("Lỗi khi lấy danh sách đánh giá:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const sendEmailForReviewer: RequestHandler = async (req: Request, res: Response) => {
    const { message, reviewId } = req.body;
    try {
        const review = await Reviews.findById(reviewId).lean();
        if (!review) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Không tìm thấy đánh giá",
            });
        }
        const reviewStars = review.rating;
        const reviewMessage = review.comment;

        const userId = review.userId;
        let user = null;
        if (userId) {
            user = await Users.findById(userId).lean();
        }

        const emailReceiver = userId ? user?.email : review.guestInfo?.email;
        const displayName = userId ? user?.displayName : review.guestInfo?.displayName;

        const renderStars = (rating: number) => {
            const fullStars = "⭐".repeat(rating);
            return fullStars;
        };

        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.MY_EMAIL,
                pass: process.env.MY_PASSWORD,
            },
        });

        const mail_configs = {
            from: process.env.MY_EMAIL,
            to: emailReceiver,
            subject: "Lamine Sport - Thư cảm ơn",
            html: `<!DOCTYPE html>
            <html lang="vi">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <meta http-equiv="X-UA-Compatible" content="IE=edge">
                    <title>Phản hồi đánh giá - Lamine Sport</title>
                    <!--[if mso]>
                    <style type="text/css">
                        table {border-collapse: collapse;}
                        .button {padding: 12px 30px !important;}
                    </style>
                    <![endif]-->
                </head>
                <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f4; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
                    
                    <!-- Wrapper Table -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4;">
                        <tr>
                            <td align="center" style="padding: 20px 0;">
                                
                                <!-- Main Container -->
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; margin: 0 auto;">
                                    
                                    <!-- Header -->
                                    <tr>
                                        <td align="center" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); background-color: #667eea; padding: 30px 20px;">
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                <tr>
                                                    <td align="center">
                                                        <!-- Logo -->
                                                        <div style="width: 60px; height: 60px; background-color: rgba(255,255,255,0.2); border-radius: 50%; margin: 0 auto 15px; line-height: 60px; text-align: center; font-size: 24px;">⚽</div>
                                                        <!-- Title -->
                                                        <h1 style="margin: 0 0 5px 0; font-size: 32px; font-weight: bold; color: #ffffff; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">Lamine Sport</h1>
                                                        <p style="margin: 0; font-size: 16px; color: #ffffff; opacity: 0.9;">Chuyên gia đồ thể thao hàng đầu Việt Nam</p>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                    
                                    <!-- Content -->
                                    <tr>
                                        <td style="padding: 40px 30px;">
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                
                                                <!-- Greeting -->
                                                <tr>
                                                    <td style="padding-bottom: 20px;">
                                                        <p style="margin: 0; font-size: 18px; color: #333333; line-height: 1.6;">
                                                            Xin chào <strong style="color: #667eea;">${displayName}</strong>,
                                                        </p>
                                                    </td>
                                                </tr>
                                                
                                                <!-- Message -->
                                                <tr>
                                                    <td style="padding-bottom: 25px;">
                                                        <p style="margin: 0 0 15px 0; font-size: 16px; color: #555555; line-height: 1.8;">
                                                            Cảm ơn bạn đã dành thời gian đánh giá sản phẩm của chúng tôi! Ý kiến của bạn rất quan trọng và giúp chúng tôi không ngừng cải thiện chất lượng dịch vụ.
                                                        </p>
                                                        <p style="margin: 0; font-size: 16px; color: #555555; line-height: 1.8;">
                                                            Chúng tôi đã nhận được đánh giá của bạn và xin gửi lời phản hồi như sau:
                                                        </p>
                                                    </td>
                                                </tr>
                                                
                                                <!-- Review Card -->
                                                <tr>
                                                    <td style="padding-bottom: 30px;">
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8f9fa; border-left: 4px solid #667eea; border-radius: 8px;">
                                                            <tr>
                                                                <td style="padding: 25px;">
                                                                    <!-- Rating and Date -->
                                                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                                        <tr>
                                                                            <td style="padding-bottom: 15px;">
                                                                                <span style="font-size: 24px; letter-spacing: 2px;">${renderStars(reviewStars)}</span>
                                                                            </td>
                                                                            <td align="right" style="padding-bottom: 15px;">
                                                                                <span style="font-size: 12px; color: #6c757d;">Ngày đánh giá: ${new Date(review.createdAt).toLocaleDateString(
                                                                                    "vi-VN"
                                                                                )}</span>
                                                                            </td>
                                                                        </tr>
                                                                    </table>
                                                                
                                                                    
                                                                    <!-- Comment -->
                                                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 15px;">
                                                                        <tr>
                                                                            <td style="background-color: #ffffff; padding: 15px; border-left: 3px solid #dee2e6; border-radius: 6px;">
                                                                                <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: 600; color: #495057;">Nhận xét của bạn:</p>
                                                                                <p style="margin: 0; font-size: 14px; color: #495057; line-height: 1.6; font-style: italic;">
                                                                                    ${reviewMessage}
                                                                                </p>
                                                                            </td>
                                                                        </tr>
                                                                    </table>
                                                                </td>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
                                                
                                                <!-- Admin Response -->
                                                <tr>
                                                    <td style="padding-bottom: 30px;">
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fff5e6; border-left: 4px solid #ff9800; border-radius: 8px;">
                                                            <tr>
                                                                <td style="padding: 25px;">
                                                                    <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #e65100;">
                                                                        💬 Phản hồi từ Lamine Sport
                                                                    </h3>
                                                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                                        <tr>
                                                                            <td style="background-color: #ffffff; padding: 20px; border-radius: 6px;">
                                                                                <p style="margin: 0; font-size: 15px; color: #495057; line-height: 1.8; white-space: pre-line;">${message}</p>
                                                                            </td>
                                                                        </tr>
                                                                    </table>
                                                                </td>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
                                                
                                                <!-- CTA Section -->
                                                <tr>
                                                    <td align="center" style="padding-bottom: 30px;">
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #e3f2fd; border-radius: 8px;">
                                                            <tr>
                                                                <td align="center" style="padding: 30px;">
                                                                    <h3 style="margin: 0 0 15px 0; font-size: 20px; color: #1565c0;">🛍️ Tiếp tục mua sắm cùng chúng tôi!</h3>
                                                                    <p style="margin: 0 0 20px 0; font-size: 15px; color: #424242;">
                                                                        Khám phá thêm nhiều sản phẩm thể thao chất lượng cao với giá tốt nhất
                                                                    </p>
                                                                    <!-- Button -->
                                                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                                                                        <tr>
                                                                            <td align="center" style="border-radius: 0px; background-color: #002d3a;">
                                                                                <a target="_blank" style="display: inline-block; padding: 12px 30px; font-size: 16px; color: #ffffff; text-decoration: none; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                                                                                    XEM SẢN PHẨM MỚI
                                                                                </a>
                                                                            </td>
                                                                        </tr>
                                                                    </table>
                                                                </td>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
                                                
                                                <!-- Info Box -->
                                                <tr>
                                                    <td style="padding-bottom: 25px;">
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px;">
                                                            <tr>
                                                                <td style="padding: 20px;">
                                                                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #495057;">
                                                                        <strong>📌 Thông tin đánh giá:</strong>
                                                                    </p>
                                                                    <p style="margin: 0 0 8px 0; font-size: 14px; color: #495057;">
                                                                        • Mã đánh giá: #${reviewId}
                                                                    </p>
                                                                    <p style="margin: 0; font-size: 14px; color: #495057;">
                                                                        • Email: ${emailReceiver}
                                                                    </p>
                                                                </td>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
                                                
                                                <!-- Contact Info -->
                                                <tr>
                                                    <td style="padding-bottom: 25px;">
                                                        <p style="margin: 0 0 10px 0; font-size: 16px; color: #555555; line-height: 1.8;">
                                                            Nếu bạn có bất kỳ thắc mắc nào khác, đừng ngại liên hệ với chúng tôi qua:
                                                        </p>
                                                        <p style="margin: 0 0 5px 0; font-size: 16px; color: #555555;">
                                                            📞 <strong>Hotline:</strong> 1900 9518
                                                        </p>
                                                        <p style="margin: 0; font-size: 16px; color: #555555;">
                                                            ✉️ <strong>Email:</strong> lamine.sportvn@gmail.vn
                                                        </p>
                                                    </td>
                                                </tr>
                                                
                                                <!-- Closing -->
                                                <tr>
                                                    <td>
                                                        <p style="margin: 0 0 15px 0; font-size: 16px; color: #555555; line-height: 1.8;">
                                                            Một lần nữa, chân thành cảm ơn bạn đã tin tưởng và ủng hộ Lamine Sport!
                                                        </p>
                                                        <p style="margin: 0; font-size: 16px; color: #555555; line-height: 1.8;">
                                                            <strong>Trân trọng,<br>Đội ngũ chăm sóc khách hàng Lamine Sport</strong>
                                                        </p>
                                                    </td>
                                                </tr>
                                                
                                            </table>
                                        </td>
                                    </tr>
                                    
                                    <!-- Footer -->
                                    <tr>
                                        <td align="center" style="background-color: #2d3436; padding: 30px 20px;">
                                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                <tr>
                                                    <td align="center">
                                                        <h3 style="margin: 0 0 15px 0; font-size: 20px; color: #74b9ff;">Lamine Sport</h3>
                                                        
                                                        <p style="margin: 0 0 5px 0; font-size: 14px; color: #b2bec3;">
                                                            📍 18/33 Đường Nguyễn Văn Thoại, Phường Mỹ An, Quận Ngũ Hành Sơn, TP Đà Nẵng
                                                        </p>
                                                        <p style="margin: 0 0 5px 0; font-size: 14px; color: #b2bec3;">
                                                            📞 Hotline: 1900 9518
                                                        </p>
                                                        <p style="margin: 0 0 20px 0; font-size: 14px; color: #b2bec3;">
                                                            ✉️ Email: lamine.sportvn@gmail.vn
                                                        </p>
                                                        
                                                        <!-- Divider -->
                                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-top: 1px solid #636e72; margin: 20px 0;">
                                                            <tr><td style="height: 1px;"></td></tr>
                                                        </table>
                                                        
                                                        <p style="margin: 0 0 5px 0; font-size: 12px; color: #b2bec3; opacity: 0.8;">
                                                            &copy; 2025 Lamine Sport. Tất cả quyền được bảo lưu.
                                                        </p>
                                                        <p style="margin: 0; font-size: 12px; color: #b2bec3; opacity: 0.8;">
                                                            Bạn nhận được email này vì đã có đánh giá tại Lamine Sport
                                                        </p>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                    
                                </table>
                                <!-- End Main Container -->
                                
                            </td>
                        </tr>
                    </table>
                    <!-- End Wrapper Table -->
                    
                </body>
            </html>`,
        };
        transporter.sendMail(mail_configs, async function (error: any, info: any) {
            if (error) {
                return res.status(500).send({
                    requestStatus: IResponseStatus.Error,
                    message: "Có lỗi xảy ra khi gửi mã xác nhận, vui lòng thử lại",
                });
            }
            return res.status(200).send({
                requestStatus: IResponseStatus.Success,
                message: "Gửi phản hồi cho khách hàng thành công",
            });
        });
    } catch (error) {
        return res.status(500).send({
            requestStatus: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

export { createReview, getAllReviews, deleteReview, pinReview, sendEmailForReviewer, getPinReview };
