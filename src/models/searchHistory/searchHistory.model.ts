/** @format */

import mongoose from "mongoose";

interface ISearchHistoryInfo {
    userId?: string;
    searchValue: string;
    isHidden: boolean;
}

const searchHistorySchema = new mongoose.Schema<ISearchHistoryInfo>(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        searchValue: {
            type: String,
            required: true,
            trim: true,
        },
        isHidden: {
            type: Boolean,
            required: false,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

const SearchHistory = mongoose.model("SearchHistory", searchHistorySchema);

export default SearchHistory;
