/** @format */

import mongoose, { Schema, Document, Types } from "mongoose";

export interface IFavoriteProducts extends Document {
    user: Types.ObjectId;
    product: Types.ObjectId;
    createdAt: Date;
}

const FavoriteProductSchema: Schema<IFavoriteProducts> = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "Users",
        required: true,
    },
    product: {
        type: Schema.Types.ObjectId,
        ref: "Products",
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

FavoriteProductSchema.index({ user: 1, product: 1 }, { unique: true });

const FavoriteProducts = mongoose.model<IFavoriteProducts>("FavoriteProducts", FavoriteProductSchema);

export default FavoriteProducts;
