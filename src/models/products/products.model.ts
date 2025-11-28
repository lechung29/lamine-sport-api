/** @format */

import mongoose, { Document } from "mongoose";

export enum ProductType {
    Shoes = 1,
    TShirt,
    Shorts,
    Skirt,
    Accessory,
}

export enum IProductPriceRangeValue {
    LessThan500K = 1,
    From500KTo1M,
    From1MTo2M,
    From2MTo5M,
    MoreThan5M,
}

export enum SportType {
    Jogging = 1,
    Tennis = 2,
    Cycling = 3,
    Football = 4,
    TableTennis = 5,
    Badminton = 6,
    Basketball = 7,
    Volleyball = 8,
    Swimming = 9,
    Camping = 10,
    Fitness = 11,
}

export enum ProductGender {
    Unisex = 1,
    Male = 2,
    Female = 3,
}

export enum ProductVisibility {
    Hidden = 1,
    Visibility = 2,
}

export enum ProductBasicColor {
    Yellow = 1,
    Orange = 2,
    Red = 3,
    Pink = 4,
    Purple = 5,
    Blue = 6,
    Green = 7,
    Black = 8,
    White = 9,
}

export interface IProductImageFile {
    uid: string;
    name: string;
    url?: string;
    type?: string;
    file?: File;
    cloudinaryData?: CloudinaryUploadResponse;
}

export interface IProductColorProps {
    id: number;
    name: string;
    value: ProductBasicColor;
    hex: string;
    quantity: number;
    images: IProductImageFile[];
}
export interface CloudinaryUploadResponse {
    url: string;
    publicId: string;
    fileName: string;
    format: string;
    width: number;
    height: number;
    bytes: number;
    createdAt: string;
    tags?: string[];
    folder?: string;
}

export interface IProductData {
    productName: string;
    brandName?: string;
    description: string;
    productType: ProductType;
    sportTypes: SportType[];
    productGender: ProductGender;
    productSizes: string[];
    productVisibility: ProductVisibility;
    originalPrice: number;
    salePrice?: number;
    productColors: IProductColorProps[];
    primaryImage: IProductImageFile;
    stockQuantity: number;
    saleQuantity: number;
    detailsDescription: string;
    detailsDescriptionId: string | null;
}

const cloudinaryDataSchema = new mongoose.Schema(
    {
        url: { type: String, required: true },
        publicId: { type: String, required: true },
        fileName: { type: String, required: true },
        format: { type: String, required: true },
        width: { type: Number, required: true },
        height: { type: Number, required: true },
        bytes: { type: Number, required: true },
        createdAt: { type: String, required: true },
        tags: [String],
        folder: String,
    },
    { _id: false }
);

const productImageSchema = new mongoose.Schema(
    {
        uid: { type: String, required: true },
        name: { type: String, required: true },
        url: String,
        type: String,
        cloudinaryData: cloudinaryDataSchema,
    },
    { _id: false }
);

const productColorSchema = new mongoose.Schema(
    {
        id: { type: Number, required: true },
        name: { type: String, required: true },
        value: {
            type: Number,
            required: true,
            enum: ProductBasicColor,
        },
        hex: { type: String, required: true },
        quantity: { type: Number, required: true, min: 0 },
        sale: { type: Number, default: 0 },
        images: [productImageSchema],
    },
    { _id: false }
);

export const productSchema = new mongoose.Schema<IProductData>(
    {
        productName: {
            type: String,
            required: true,
            index: true,
        },
        brandName: {
            type: String,
            trim: true,
        },
        description: {
            type: String,
            required: true,
            trim: true,
        },
        productType: {
            type: Number,
            required: true,
            enum: ProductType,
        },
        sportTypes: [
            {
                type: Number,
                required: true,
                enum: SportType,
            },
        ],
        productGender: {
            type: Number,
            required: true,
            enum: ProductGender,
        },
        productSizes: [
            {
                type: String,
                required: true,
                trim: true,
            },
        ],
        productVisibility: {
            type: Number,
            required: true,
            enum: ProductVisibility,
            default: ProductVisibility.Visibility,
        },
        originalPrice: {
            type: Number,
            required: true,
            min: 0,
        },
        salePrice: {
            type: Number,
            min: 0,
        },
        productColors: [productColorSchema],
        primaryImage: productImageSchema,
        stockQuantity: {
            type: Number,
            required: true,
            min: 0,
        },
        saleQuantity: {
            type: Number,
            default: 0,
        },
        detailsDescriptionId: {
            type: String,
            required: false,
            default: null,
        },
        detailsDescription: {
            type: String,
            required: true,
            trim: true,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

productSchema.index({ productName: "text" });

const Products = mongoose.model("Products", productSchema);

export default Products;
