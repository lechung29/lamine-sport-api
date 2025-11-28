/** @format */

import { Request, RequestHandler, Response } from "express";
import { IResponseStatus } from "../models/users/users.model";
import SearchHistory from "../models/searchHistory/searchHistory.model";
import mongoose from "mongoose";

const getRecentSearches: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(401).send({
                status: IResponseStatus.Error,
                message: "Người dùng chưa xác thực",
            });
        }

        const recentSearches = await SearchHistory.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                    isHidden: false,
                },
            },
            {
                $sort: { createdAt: -1 },
            },
            {
                $group: {
                    _id: "$searchValue",
                    doc: { $first: "$$ROOT" },
                },
            },
            {
                $replaceRoot: { newRoot: "$doc" },
            },
            {
                $sort: { createdAt: -1 },
            },
            {
                $limit: 5,
            },
        ]);

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy giá trị tìm kiếm gần nhất thành công",
            data: recentSearches,
        });
    } catch (error) {
        console.error("Error getting recent searches:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const getTopSearches: RequestHandler = async (req: Request, res: Response) => {
    try {
        const topSearches = await SearchHistory.aggregate([
            {
                $group: {
                    _id: "$searchValue",
                    searchCount: { $sum: 1 },
                    createdAt: { $max: "$createdAt" },
                },
            },
            {
                $sort: { searchCount: -1 },
            },
            {
                $limit: 5,
            },
            {
                $project: {
                    _id: 0,
                    searchValue: "$_id",
                    searchCount: 1,
                    createdAt: 1,
                },
            },
        ]);

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy giá trị tìm kiếm nhiều nhất thành công",
            data: topSearches,
        });
    } catch (error) {
        console.error("Error getting top searches:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const removeSearchHistory: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { searchValue, userId } = req.body;
        await SearchHistory.updateMany(
            {
                searchValue: searchValue,
                userId: new mongoose.Types.ObjectId(userId),
            },
            {
                $set: {
                    isHidden: true,
                },
            }
        );
        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Xóa lịch sử tìm kiếm thành công",
        });
    } catch (error) {
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

export { getRecentSearches, getTopSearches, removeSearchHistory };
