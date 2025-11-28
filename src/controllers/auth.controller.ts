/** @format */

import { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import bcryptjs from "bcryptjs";
import Users, { IUserData, IUserInfo, IResponseStatus, ICustomerStatus } from "../models/users/users.model";
import PRTokens from "../models/otps/PRTokens.model";
import nodemailer from "nodemailer";
import { v4 as uuidv4 } from "uuid";

//#region Register New User

const registerNewCustomerOrAdmin: RequestHandler = async (req: Request<{}, {}, Pick<IUserData, "firstName" | "lastName" | "email" | "phoneNumber" | "password">, {}>, res: Response) => {
    const { firstName, lastName, email, phoneNumber, password } = req.body;
    const existingEmail = await Users.findOne({ email });
    const existingPhoneNumber = await Users.findOne({ phoneNumber });
    if (!!existingEmail) {
        return res.status(400).send({
            status: IResponseStatus.Error,
            fieldError: "email",
            message: "Email bạn đã nhập đã được đăng ký cho một tài khoản khác. Vui lòng sử dụng địa chỉ email khác để tiếp tục đăng ký",
        });
    } else if (!!existingPhoneNumber) {
        return res.status(400).send({
            status: IResponseStatus.Error,
            fieldError: "phoneNumber",
            message: "Số điện thoại bạn đã nhập đã được đăng ký cho một tài khoản khác. Vui lòng sử dụng số điện thoại khác để tiếp tục đăng ký",
        });
    } else {
        const hashPassword = bcryptjs.hashSync(password, 10);
        const newCustomer = new Users({
            firstName,
            lastName,
            displayName: `${firstName} ${lastName}`,
            email,
            phoneNumber,
            password: hashPassword,
        });

        try {
            await newCustomer.save();
            return res.status(201).send({
                status: IResponseStatus.Success,
                message: "Chào mừng bạn! Tài khoản của bạn đã được tạo thành công và hiện đã được kích hoạt. Bạn có thể bắt đầu sử dụng các dịch vụ của chúng tôi",
            });
        } catch (error: any) {
            return res.status(500).send({
                status: IResponseStatus.Error,
                message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
            });
        }
    }
};

//#endregion

//#region Login User

const loginCustomer: RequestHandler = async (req: Request<{}, {}, Pick<IUserData, "email" | "password">>, res: Response) => {
    const { email, password } = req.body;
    const existingCustomerOrAdmin = await Users.findOne({ email });

    if (!existingCustomerOrAdmin) {
        return res.status(400).send({
            status: IResponseStatus.Error,
            fieldError: "email",
            message: "Địa chỉ email bạn đã nhập không liên kết với bất kỳ tài khoản nào. Vui lòng kiểm tra lại email của bạn hoặc đăng ký nếu bạn chưa có tài khoản",
        });
    } else if (!bcryptjs.compareSync(password, existingCustomerOrAdmin.password)) {
        return res.status(400).send({
            status: IResponseStatus.Error,
            fieldError: "password",
            message: "Mật khẩu bạn nhập không chính xác. Vui lòng kiểm tra lại và thử lại. Nếu bạn đã quên mật khẩu, bạn có thể đặt lại bằng cách nhấn nút 'Quên mật khẩu' bên dưới",
        });
    } else if (existingCustomerOrAdmin.status === ICustomerStatus.Locked) {
        return res.status(403).send({
            status: IResponseStatus.Error,
            // fieldError: "password",
            message: "Tài khoản của bạn đã bị khóa, vui lòng liên hệ bộ phận chăm sóc khách hàng để hỗ trợ",
        });
    } else {
        try {
            const accessToken = await jwt.sign({ id: existingCustomerOrAdmin.id, displayName: existingCustomerOrAdmin.displayName }, process.env.JWT_SECRET!, { expiresIn: "10m" });
            const currentRefreshToken = await jwt.sign(
                { id: existingCustomerOrAdmin.id, email: existingCustomerOrAdmin.email, displayName: existingCustomerOrAdmin.displayName },
                process.env.JWT_SECRET!,
                {
                    expiresIn: "1d",
                }
            );
            await existingCustomerOrAdmin.updateOne({ $push: { refreshToken: currentRefreshToken } });
            const { password, refreshToken, ...rest } = existingCustomerOrAdmin.toObject();
            return res.status(200)
                .cookie("refreshToken", currentRefreshToken, { httpOnly: true, secure: true, sameSite: "none" })
                .send({
                    status: IResponseStatus.Success,
                    message: "Chào mừng bạn, bạn đã đăng nhập vào tài khoản của mình thành công!",
                    data: {
                        ...rest,
                        accessToken,
                    },
                });
        } catch (error) {
            return res.status(500).send({
                status: IResponseStatus.Error,
                message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
            });
        }
    }
};

const loginWithGoogle: RequestHandler = async (req: Request, res: Response) => {
    const { email, firstName, lastName, avatar } = req.body;

    try {
        let isFirstLogin = false;
        let existingUser = await Users.findOne({ email });

        if (existingUser && existingUser.status === ICustomerStatus.Locked) {
            return res.status(403).send({
                status: IResponseStatus.Error,
                // fieldError: "password",
                message: "Tài khoản của bạn đã bị khóa, vui lòng liên hệ bộ phận chăm sóc khách hàng để hỗ trợ",
            });
        }

        if (!existingUser) {
            const newUser = new Users({
                firstName: firstName,
                lastName: lastName,
                displayName: `${firstName} ${lastName}`,
                email,
                avatar: avatar,
                role: "user",
                status: 1,
                password: bcryptjs.hashSync(Math.random().toString(36), 10),
            });
            isFirstLogin = true;

            await newUser.save();
            existingUser = newUser;
        }

        const accessToken = await jwt.sign({ id: existingUser.id, displayName: existingUser.displayName }, process.env.JWT_SECRET!, { expiresIn: "10m" });

        const currentRefreshToken = await jwt.sign(
            {
                id: existingUser.id,
                email: existingUser.email,
                displayName: existingUser.displayName,
            },
            process.env.JWT_SECRET!,
            { expiresIn: "1d" }
        );

        await existingUser.updateOne({ $push: { refreshToken: currentRefreshToken } });

        const { password, refreshToken, ...rest } = existingUser.toObject();

        return res
            .status(200)
            .cookie("refreshToken", currentRefreshToken, {
                httpOnly: true,
                secure: true,
                sameSite: "none",
            })
            .send({
                status: IResponseStatus.Success,
                message: "Đăng nhập Google thành công!",
                data: {
                    ...rest,
                    accessToken,
                    isFirstLogin,
                },
            });
    } catch (error: any) {
        console.error("Google login error:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const logoutCustomer: RequestHandler = async (req: Request, res: Response) => {
    try {
        const refreshToken = req.cookies?.refreshToken;

        if (refreshToken) {
            const user = await Users.findOne({ refreshToken: refreshToken });
            if (user) {
                user.refreshToken = user.refreshToken.filter((token) => token !== refreshToken);
                await user.save();
            }
        }

        res.clearCookie("refreshToken", {
            httpOnly: true,
            secure: true,
            sameSite: "none",
        });

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Đăng xuất thành công",
        });
    } catch (error) {
        console.error("Logout error:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

//#endregion

//#region Refresh Token

const refreshToken: RequestHandler = async (req: Request, res: Response, NextFunction: NextFunction) => {
    const cookieRefreshToken = req.cookies?.refreshToken;
    if (!cookieRefreshToken) {
        return res.status(200).send({
            status: IResponseStatus.Error,
            message: "Phiên đăng nhập của bạn đã hết hạn, vui lòng đăng nhập lại",
        });
    } else {
        let tempCustomer: IUserInfo | undefined = undefined;
        await jwt.verify(cookieRefreshToken, process.env.JWT_SECRET!, async (err: any, customer: any) => {
            if (err) {
                const existingCustomer = await Users.findOne({ email: (customer as IUserInfo).email });
                if (existingCustomer) {
                    const currentCustomerRefreshTokens = existingCustomer.refreshToken;
                    await existingCustomer?.updateOne({ $pull: { refreshToken: currentCustomerRefreshTokens.filter((i) => i !== cookieRefreshToken) } });
                }
                return res.status(200).send({
                    status: IResponseStatus.Error,
                    message: "Phiên đăng nhập của bạn đã hết hạn, vui lòng đăng nhập lại",
                });
            } else {
                tempCustomer = customer as IUserInfo;
                const newAccessToken = await jwt.sign({ id: tempCustomer.id, displayName: tempCustomer.displayName }, process.env.JWT_SECRET!, { expiresIn: "10m" });
                return res.status(200).send({
                    accessToken: newAccessToken,
                });
            }
        });
    }
};

//#region request password recovery

const requestPasswordRecovery: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
    const { email } = req.body;

    const validCustomer = await Users.findOne({ email });
    if (!validCustomer) {
        return res.status(400).send({
            status: IResponseStatus.Error,
            fieldError: "email",
            message: "Địa chỉ email bạn đã nhập không liên kết với bất kỳ tài khoản nào. Vui lòng kiểm tra lại email của bạn hoặc đăng ký nếu bạn chưa có tài khoản",
        });
    }

    const existingOtp = await PRTokens.findOne({ customerEmail: email });
    if (existingOtp) {
        return res.status(200).send({
            requestStatus: IResponseStatus.Success,
            message: "Gửi mã OTP thành công",
        });
    }

    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.MY_EMAIL,
                pass: process.env.MY_PASSWORD,
            },
        });

        const generationToken = uuidv4();

        const resetPasswordLink = `http://localhost:5173/recovery-password?token=${generationToken}&customerEmail=${validCustomer.email}`;

        const mail_configs = {
            from: process.env.MY_EMAIL,
            to: email,
            subject: "Lamine Sport - Khôi phục mật khẩu",
            html: `<!DOCTYPE html>
                <html lang="vi">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Khôi phục mật khẩu - Lamine Sport</title>
                    <style>
                        * {
                            margin: 0;
                            padding: 0;
                            box-sizing: border-box;
                        }
                        
                        body {
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            line-height: 1.6;
                            color: #333;
                            background-color: #f4f4f4;
                        }
                        
                        .email-container {
                            max-width: 600px;
                            margin: 0 auto;
                            background-color: #ffffff;
                            box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
                        }
                        
                        .header {
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            padding: 30px 20px;
                            text-align: center;
                            color: white;
                        }
                        
                        .header h1 {
                            font-size: 32px;
                            font-weight: bold;
                            margin-bottom: 5px;
                            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                        }
                        
                        .header .subtitle {
                            font-size: 16px;
                            opacity: 0.9;
                            font-weight: 300;
                        }
                        
                        .logo {
                            width: 60px;
                            height: 60px;
                            background: rgba(255,255,255,0.2);
                            border-radius: 50%;
                            margin: 0 auto 15px;
                            display: block;
                            text-align: center;
                            font-size: 24px;
                            line-height: 60px;
                            position: relative;
                        }
                        
                        .content {
                            padding: 40px 30px;
                        }
                        
                        .greeting {
                            font-size: 18px;
                            margin-bottom: 20px;
                            color: #333;
                        }
                        
                        .message {
                            font-size: 16px;
                            line-height: 1.8;
                            margin-bottom: 30px;
                            color: #555;
                        }
                        
                        .reset-button {
                            text-align: center;
                            margin: 40px 0;
                        }
                        
                        .btn {
                            display: inline-block;
                            background: #002d3a;
                            color: white!important;
                            text-decoration: none;
                            padding: 8px 16px;
                            border-radius: 0px;
                            font-size: 18px;
                            font-weight: 600;
                            text-transform: uppercase;
                            letter-spacing: 1px;
                            transition: all 0.3s ease;
                        }
                        
                        .btn:hover {
                            cursor: pointer;
                            transform: translateY(-2px);
                            box-shadow: 0 12px 35px rgba(255, 107, 107, 0.6);
                        }
                        
                        .warning-box {
                            background: linear-gradient(135deg, #ffeaa7, #fdcb6e);
                            border-left: 4px solid #e17055;
                            padding: 20px;
                            margin: 30px 0;
                            border-radius: 8px;
                        }
                        
                        .warning-box h3 {
                            color: #d63031;
                            margin-bottom: 10px;
                            font-size: 16px;
                        }
                        
                        .warning-box p {
                            color: #636e72;
                            font-size: 14px;
                            margin: 0;
                        }
                        
                        .footer {
                            background-color: #2d3436;
                            color: #b2bec3;
                            padding: 30px 20px;
                            text-align: center;
                        }
                        
                        .footer h3 {
                            color: #74b9ff;
                            margin-bottom: 15px;
                            font-size: 20px;
                        }
                        
                        .contact-info {
                            margin: 20px 0;
                            font-size: 14px;
                        }
                        
                        .contact-info p {
                            margin: 5px 0;
                        }
                        
                        .social-links {
                            margin: 20px 0;
                        }
                        
                        .social-links a {
                            display: inline-block;
                            width: 40px;
                            height: 40px;
                            background: #74b9ff;
                            color: white;
                            text-decoration: none;
                            border-radius: 50%;
                            margin: 0 10px;
                            line-height: 40px;
                            font-weight: bold;
                            transition: all 0.3s ease;
                        }
                        
                        .social-links a:hover {
                            background: #0984e3;
                            transform: translateY(-2px);
                        }
                        
                        .copyright {
                            border-top: 1px solid #636e72;
                            padding-top: 20px;
                            margin-top: 20px;
                            font-size: 12px;
                            opacity: 0.8;
                        }
                        
                        /* Responsive Design */
                        @media (max-width: 600px) {
                            .email-container {
                                margin: 0;
                                box-shadow: none;
                            }
                            
                            .content {
                                padding: 30px 20px;
                            }
                            
                            .header {
                                padding: 25px 15px;
                            }
                            
                            .header h1 {
                                font-size: 26px;
                            }
                            
                            .btn {
                                padding: 12px 30px;
                                font-size: 16px;
                            }
                            
                            .warning-box {
                                padding: 15px;
                            }
                        }
                    </style>
                </head>
                <body>
                    <div class="email-container">
                        <!-- Header -->
                        <div class="header">
                            <div class="logo">⚽</div>
                            <h1>Lamine Sport</h1>
                            <p class="subtitle">Chuyên gia đồ thể thao hàng đầu Việt Nam</p>
                        </div>
                        
                        <!-- Content -->
                        <div class="content">
                            <div class="greeting">
                                Xin chào <strong>${validCustomer.displayName}</strong>,
                            </div>
                            
                            <div class="message">
                                <p>Chúng tôi đã nhận được yêu cầu khôi phục mật khẩu cho tài khoản Lamine Sport của bạn. Đừng lo lắng, điều này xảy ra với tất cả mọi người!</p>
                                
                                <p>Để tạo mật khẩu mới và tiếp tục mua sắm những sản phẩm thể thao tuyệt vời, vui lòng nhấp vào nút bên dưới:</p>
                            </div>
                            
                            <div class="reset-button">
                                <a href="${resetPasswordLink}" class="btn">Khôi phục mật khẩu</a>
                            </div>
                            
                            <div class="warning-box">
                                <h3>⚠️ Lưu ý quan trọng:</h3>
                                <p>• Liên kết này chỉ có hiệu lực trong <strong>24 giờ</strong><br>
                                • Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này<br>
                                • Không chia sẻ liên kết này với bất kỳ ai khác</p>
                            </div>
                            
                            <div class="message">
                                <p>Nếu nút không hoạt động, bạn có thể sao chép và dán liên kết sau vào trình duyệt:</p>
                                <p style="word-break: break-all; background: #f8f9fa; padding: 10px; border-radius: 5px; font-family: monospace;">${resetPasswordLink}</p>
                            </div>
                            
                            <div class="message">
                                <p>Cảm ơn bạn đã tin tưởng Lamine Sport!</p>
                                <p><strong>Đội ngũ hỗ trợ Lamine Sport</strong></p>
                            </div>
                        </div>
                        
                        <!-- Footer -->
                        <div class="footer">
                            <h3>Lamine Sport</h3>
                            <div class="contact-info">
                                <p>📍 18/33 Đường Nguyễn Văn Thoại, Phường Mỹ An, Quận Ngũ Hành Sơn, TP Đà Nẵng</p>
                                <p>📞 Hotline: 1900 9518</p>
                                <p>✉️ Email: lamine.sportvn@gmail.vn</p>
                            </div>
                            
                            <div class="copyright">
                                <p>&copy; 2025 Lamine Sport. Tất cả quyền được bảo lưu.</p>
                                <p>Bạn nhận được email này vì đã có tài khoản tại Lamine Sport</p>
                            </div>
                        </div>
                    </div>
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
            const newOtp = new PRTokens({
                token: generationToken,
                customerEmail: email,
            });

            await newOtp.save();

            return res.status(200).send({
                requestStatus: IResponseStatus.Success,
                message: "Send OTP successfully",
            });
        });
    } catch (error) {
        return res.status(500).send({
            requestStatus: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

//#endregion request password recovery

//#region verify RP token

const verifyRecoveryPasswordToken: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
    const { email, token } = req.query;

    try {
        const validToken = await PRTokens.findOne({ customerEmail: email, token });
        if (!validToken) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Liên kết của bạn đã hết hạn hoặc không tồn tại",
            });
        }

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Xác thực link thành công",
        });
    } catch (error) {
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

//#endregion verify RP token

//#region change password with RP token

const resetPasswordByRPToken: RequestHandler = async (req: Request, res: Response) => {
    const { email } = req.body;

    const validCustomer = await Users.findOne({ email: email });
    if (!validCustomer) {
        return res.status(200).send({
            status: IResponseStatus.Error,
            message: "Tài khoản email của bạn đã bị xóa hoặc không tồn tại",
        });
    }

    req.body.password = bcryptjs.hashSync(req.body.password, 13);

    try {
        await Users.findOneAndUpdate(
            {
                email: email,
            },
            {
                $set: {
                    password: req.body.password,
                },
            },
            { new: true }
        )
            .lean()
            .exec();
        await PRTokens.findOneAndDelete({ customerEmail: email });

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Cập nhật mật khẩu thành công",
        });
    } catch (error) {
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

export {
    registerNewCustomerOrAdmin as registerNewCustomer,
    loginCustomer,
    loginWithGoogle,
    refreshToken,
    verifyRecoveryPasswordToken,
    resetPasswordByRPToken,
    requestPasswordRecovery,
    logoutCustomer,
};
