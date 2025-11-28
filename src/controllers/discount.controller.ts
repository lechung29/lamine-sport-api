/** @format */

import { Request, RequestHandler, Response } from "express";
import DiscountProgram, { DiscountApplyType, DiscountStatus } from "../models/discounts/discounts.model";
import { IResponseStatus } from "../models/users/users.model";

const createDiscountProgram: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { programName, discountPercentage, startDate, endDate, applyType, productIds, applySetting } = req.body;

        const now = new Date();
        let tempStatus = DiscountStatus.Active;
        if (new Date(startDate) > now) {
            tempStatus = DiscountStatus.Scheduled;
        }

        const newProgram = new DiscountProgram({
            programName,
            discountPercentage,
            startDate,
            endDate,
            applyType,
            applySetting,
            status: tempStatus,
            productIds: applyType === DiscountApplyType.SpecificProducts ? productIds : [],
        });

        await newProgram.save();

        return res.status(201).send({
            status: IResponseStatus.Success,
            message: "Chương trình giảm giá đã được tạo thành công!",
        });
    } catch (error) {
        console.log(error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const getCurrentProgram: RequestHandler = async (req: Request, res: Response) => {
    try {
        const currentProgram = await DiscountProgram.find({ status: { $in: [DiscountStatus.Active, DiscountStatus.Scheduled] } });
        if (!!currentProgram.length) {
            return res.status(200).send({
                status: IResponseStatus.Success,
                message: "Lấy thông tin chương trình giảm giá thành công",
                data: currentProgram[0],
            });
        } else {
            return res.status(200).send({
                status: IResponseStatus.Success,
                message: "Chưa có chương trình giảm giá nào hiện tại",
                data: null,
            });
        }
    } catch (error) {
        console.log(error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const updateProgram: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { _id, programName, discountPercentage, startDate, endDate, applyType, productIds, applySetting } = req.body;

        const currentProgram = await DiscountProgram.findById({ _id });
        if (!currentProgram) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Chương trình giảm giá không tồn tại",
            });
        }

        currentProgram.discountPercentage = discountPercentage ?? currentProgram.discountPercentage;
        currentProgram.programName = programName ?? currentProgram.programName;
        currentProgram.applyType = applyType ?? currentProgram.applyType;
        currentProgram.startDate = startDate ?? currentProgram.startDate;
        currentProgram.endDate = endDate ?? currentProgram.endDate;
        currentProgram.productIds = (currentProgram.applyType === DiscountApplyType.SpecificProducts ? productIds : []) ?? currentProgram.productIds;
        currentProgram.applySetting = applySetting ?? currentProgram.applySetting;

        const now = new Date();
        const newStartDate = new Date(currentProgram.startDate);
        if (newStartDate > now) {
            currentProgram.status = DiscountStatus.Scheduled;
        } else {
            currentProgram.status = DiscountStatus.Active;
        }

        const newEndDate = new Date(currentProgram.endDate);
        if (newEndDate < now) {
            currentProgram.status = DiscountStatus.Expired;
        }

        await currentProgram.save();

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Chương trình giảm giá đã được cập nhật thành công!",
        });
    } catch (error) {
        console.log(error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const cancelProgram: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { _id, status } = req.body;
        const currentProgram = await DiscountProgram.findById({ _id });
        if (!currentProgram) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Chương trình giảm giá không tồn tại",
            });
        }

        currentProgram.status = status;
        await currentProgram.save();

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Chương trình giảm giá đã hủy thành công!",
        });
    } catch (error) {
        console.log(error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

export { createDiscountProgram, getCurrentProgram, updateProgram, cancelProgram };
