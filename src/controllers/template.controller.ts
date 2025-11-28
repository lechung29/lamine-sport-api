/** @format */

import { Request, RequestHandler, Response } from "express";
import { IResponseStatus } from "../models/users/users.model";
import Templates from "../models/templates/template.model";
import Products from "../models/products/products.model";

const createTemplate: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { templateName, templateContent } = req.body;

        const existingTemplate = await Templates.findOne({
            templateName: { $regex: new RegExp(`^${templateName}$`, "i") },
        });

        if (existingTemplate) {
            return res.status(409).send({
                status: IResponseStatus.Error,
                message: "Tên template đã tồn tại",
                fieldError: "name",
            });
        }

        const newTemplate = new Templates({
            templateName: templateName.trim(),
            templateContent: templateContent.trim(),
        });

        await newTemplate.save();

        return res.status(201).send({
            status: IResponseStatus.Success,
            message: "Tạo template thành công",
        });
    } catch (error: any) {
        console.error("Error creating template:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const getAllTemplates: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { search, page = 1, limit = 10 } = req.query;

        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);
        const skip = (pageNum - 1) * limitNum;

        let query: any = {};
        if (search) {
            query.templateName = { $regex: search as string, $options: "i" };
        }

        const templates = await Templates.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum);

        const totalCounts = await Templates.countDocuments(query);

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy danh sách template thành công",
            data: {
                templates,
                totalCounts,
            },
        });
    } catch (error: any) {
        console.error("Error getting templates:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const deleteTemplate: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const template = await Templates.findById(id);

        if (!template) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Không tìm thấy template",
            });
        }

        await template.deleteOne();

        await Products.updateMany(
            {
                detailsDescriptionId: id,
            },
            {
                $set: {
                    detailsDescriptionId: null,
                },
            }
        );

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Xóa template thành công",
        });
    } catch (error: any) {
        console.error("Error deleting template:", error);
        res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const updateTemplate: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { templateName, templateContent } = req.body;

        const template = await Templates.findById(id);
        if (!template) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Không tìm thấy template",
            });
        }

        if (templateName.trim() !== template.templateName) {
            const existingTemplate = await Templates.findOne({
                _id: { $ne: id },
                templateName: { $regex: new RegExp(`^${templateName}$`, "i") },
            });

            if (existingTemplate) {
                return res.status(409).send({
                    status: IResponseStatus.Error,
                    message: "Tên template đã tồn tại",
                    fieldError: "name",
                });
            }
        }

        template.templateName = templateName.trim();
        template.templateContent = templateContent.trim();

        await template.save();

        await Products.updateMany(
            {
                detailsDescriptionId: id,
            },
            {
                $set: {
                    detailsDescription: template.templateContent,
                },
            }
        );

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Cập nhật template thành công",
        });
    } catch (error: any) {
        console.error("Error updating template:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

export { createTemplate, deleteTemplate, updateTemplate, getAllTemplates };
