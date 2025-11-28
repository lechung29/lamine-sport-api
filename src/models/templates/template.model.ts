/** @format */

import mongoose, { Schema, Document } from "mongoose";

export interface ITemplate extends Document {
    templateName: string;
    templateContent: string;
    createdAt: Date;
    updatedAt: Date;
}

const templateSchema: Schema = new Schema(
    {
        templateName: {
            type: String,
            required: true,
            trim: true,
        },
        templateContent: {
            type: String,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

const Templates = mongoose.model("Templates", templateSchema);

export default Templates;
