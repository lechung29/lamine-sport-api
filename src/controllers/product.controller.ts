/** @format */

import { Request, RequestHandler, Response } from "express";
import Products, { IProductData, IProductPriceRangeValue, ProductVisibility, SportType } from "../models/products/products.model";
import { IResponseStatus } from "../models/users/users.model";
import mongoose, { PipelineStage, SortOrder } from "mongoose";
import { ParamsDictionary } from "express-serve-static-core";
import { ParsedQs } from "qs";
import { AuthenticatedRequest } from "../middlewares/auth";
import FavoriteProducts, { IFavoriteProducts } from "../models/favorite-products/favorite-product.model";
import DiscountProgram, { ApplySetting, DiscountApplyType, DiscountStatus } from "../models/discounts/discounts.model";
import SearchHistory from "../models/searchHistory/searchHistory.model";
import { cloneDeep } from "lodash";

const createNewProduct: RequestHandler = async (req: Request<{}, {}, IProductData, {}>, res: Response) => {
    try {
        const {
            productName,
            brandName,
            description,
            productType,
            sportTypes,
            productGender,
            productSizes,
            productVisibility,
            originalPrice,
            salePrice,
            productColors,
            primaryImage,
            detailsDescriptionId,
            detailsDescription,
        } = req.body;
        let productQuantity = 0;
        productColors.forEach((color) => {
            productQuantity = productQuantity + color.quantity;
        });
        const newProduct = new Products({
            productName: productName.trim(),
            brandName: brandName?.trim(),
            description: description.trim(),
            productType,
            sportTypes,
            productGender,
            productSizes,
            productVisibility,
            originalPrice,
            salePrice,
            productColors,
            primaryImage,
            stockQuantity: productQuantity,
            detailsDescriptionId: detailsDescriptionId || null,
            detailsDescription,
        });

        const savedProduct = await newProduct.save();

        return res.status(201).send({
            status: IResponseStatus.Success,
            message: "Tạo sản phẩm mới thành công",
            data: savedProduct,
        });
    } catch (error: any) {
        console.error(error);
        if (error.name === "ValidationError") {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "Có lỗi khi xác thực sản phẩm",
                errors: Object.values(error.errors).map((err: any) => err.message),
            });
        }

        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const getProducts: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { sort, search, page = "1", limit = "9", productPrice, ...filters } = req.query;

        const convertPage = parseInt(page as string);
        const convertLimit = parseInt(limit as string);

        const priceFilter = productPrice ? (Array.isArray(productPrice) ? productPrice.map(Number) : [Number(productPrice)]) : null;

        const mongoFilter: { [key: string]: Object } = {};
        for (const key in filters) {
            const value = filters[key];
            if (key === "productColors") {
                const colorValues = Array.isArray(value) ? value.map(Number) : [Number(value)];
                mongoFilter["productColors.value"] = { $in: colorValues };
            } else if (key === "productSizes") {
                const items = Array.isArray(value) ? value : [value];
                mongoFilter[key] = { $in: items };
            } else {
                const items = Array.isArray(value) ? value.map(Number) : [Number(value)];
                mongoFilter[key] = { $in: items };
            }
        }

        mongoFilter.productVisibility = ProductVisibility.Visibility;

        if (search) {
            mongoFilter.$text = { $search: String(search) };
        }

        const vietnameseCollation = {
            locale: "vi",
            caseLevel: false,
            strength: 1,
        };

        const sortOptions: { [key: string]: SortOrder } = {};
        if (sort === "price_desc") {
            sortOptions.originalPrice = -1;
        } else if (sort === "price_asc") {
            sortOptions.originalPrice = 1;
        } else if (sort === "name_asc") {
            sortOptions.productName = 1;
        } else if (sort === "name_desc") {
            sortOptions.productName = -1;
        } else {
            sortOptions.createdAt = -1;
        }

        let query = Products.find(mongoFilter).sort(sortOptions);
        if (sort === "name_asc" || sort === "name_desc") {
            query = query.collation(vietnameseCollation);
        }
        let allProducts = await query.lean();

        const discountProgramList = await DiscountProgram.find({ status: DiscountStatus.Active }).lean();
        const currentProgram = discountProgramList[0];

        if (currentProgram) {
            const isAlwaysApplyNewSalePrice = currentProgram.applySetting === ApplySetting.AlwaysApply;
            if (currentProgram.applyType === DiscountApplyType.AllProducts) {
                if (isAlwaysApplyNewSalePrice) {
                    allProducts.forEach((product) => {
                        const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                        const newSalePrice = product.originalPrice - discountAmount;
                        product.salePrice = newSalePrice;
                    });
                } else {
                    allProducts.forEach((product) => {
                        const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                        const newSalePrice = product.originalPrice - discountAmount;
                        if (!product.salePrice || product.salePrice > newSalePrice) {
                            product.salePrice = newSalePrice;
                        }
                    });
                }
            } else {
                if (isAlwaysApplyNewSalePrice) {
                    allProducts.forEach((product) => {
                        if (currentProgram.productIds?.map((id) => id.toString()).includes(product._id.toString())) {
                            const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                            const newSalePrice = product.originalPrice - discountAmount;
                            product.salePrice = newSalePrice;
                        }
                    });
                } else {
                    allProducts.forEach((product) => {
                        if (currentProgram.productIds?.map((id) => id.toString()).includes(product._id.toString())) {
                            const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                            const newSalePrice = product.originalPrice - discountAmount;
                            if (!product.salePrice || product.salePrice > newSalePrice) {
                                product.salePrice = newSalePrice;
                            }
                        }
                    });
                }
            }
        }

        let filteredProducts = allProducts;
        if (priceFilter && priceFilter.length > 0) {
            filteredProducts = allProducts.filter((product) => {
                const effectivePrice = product.salePrice || product.originalPrice;

                return priceFilter.some((range) => {
                    switch (range) {
                        case IProductPriceRangeValue.LessThan500K:
                            return effectivePrice <= 500000;
                        case IProductPriceRangeValue.From500KTo1M:
                            return effectivePrice >= 500000 && effectivePrice <= 1000000;
                        case IProductPriceRangeValue.From1MTo2M:
                            return effectivePrice >= 1000000 && effectivePrice <= 2000000;
                        case IProductPriceRangeValue.From2MTo5M:
                            return effectivePrice >= 2000000 && effectivePrice <= 5000000;
                        case IProductPriceRangeValue.MoreThan5M:
                            return effectivePrice >= 5000000;
                        default:
                            return false;
                    }
                });
            });
        }

        if (sort === "price_desc" || sort === "price_asc") {
            filteredProducts.sort((a, b) => {
                const priceA = a.salePrice || a.originalPrice;
                const priceB = b.salePrice || b.originalPrice;
                return sort === "price_desc" ? priceB - priceA : priceA - priceB;
            });
        }

        const totalCounts = filteredProducts.length;
        const skip = (convertPage - 1) * convertLimit;
        const products = filteredProducts.slice(skip, skip + convertLimit);

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy sản phẩm thành công",
            data: {
                products,
                totalCounts,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const getProductsByName: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { search } = req.query;
        const mongoFilter: { [key: string]: Object } = {};
        if (search) {
            mongoFilter.productName = { $regex: search, $options: "i" };
        }
        mongoFilter.productVisibility = ProductVisibility.Visibility;
        let query = Products.find(mongoFilter);
        const products = await query;
        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy sản phẩm thành công",
            data: products,
        });
    } catch (error) {
        console.error(error);
        res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const getProductListById: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { productIds } = req.body;

        if (!productIds || !Array.isArray(productIds)) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "productIds phải là một array",
            });
        }

        if (productIds.length === 0) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "productIds không được rỗng",
            });
        }

        const products = await Products.find({ _id: { $in: productIds }, productVisibility: ProductVisibility.Visibility });

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy danh sách sản phẩm thành công",
            data: products,
        });
    } catch (error) {
        console.error("Error fetching products:", error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const getProductDetails: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { productId } = req.params;
        let currentProduct = await Products.findById(productId).lean();

        if (!currentProduct || currentProduct.productVisibility === ProductVisibility.Hidden) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Sản phẩm không tồn tại hoặc đã bị xóa",
            });
        }

        const productSportTypes = currentProduct.sportTypes;
        let relatedProducts = await Products.find({
            sportTypes: { $in: productSportTypes },
            _id: { $ne: currentProduct._id },
        })
            .limit(10)
            .lean();

        const discountProgramList = await DiscountProgram.find({ status: DiscountStatus.Active }).lean();
        const currentProgram = discountProgramList[0];

        if (currentProgram) {
            const isAlwaysApplyNewSalePrice = currentProgram.applySetting === ApplySetting.AlwaysApply;
            if (currentProgram.applyType === DiscountApplyType.AllProducts) {
                if (isAlwaysApplyNewSalePrice) {
                    // Change sale price of current product
                    const discountAmount = (currentProduct.originalPrice * currentProgram.discountPercentage) / 100;
                    const newSalePrice = currentProduct.originalPrice - discountAmount;
                    currentProduct.salePrice = newSalePrice;

                    //change sale price of related products
                    relatedProducts.forEach((product) => {
                        const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                        const newSalePrice = product.originalPrice - discountAmount;
                        product.salePrice = newSalePrice;
                    });
                } else {
                    // Change sale price of current product
                    const discountAmount = (currentProduct.originalPrice * currentProgram.discountPercentage) / 100;
                    const newSalePrice = currentProduct.originalPrice - discountAmount;
                    if (!currentProduct.salePrice || currentProduct.salePrice > newSalePrice) {
                        currentProduct.salePrice = newSalePrice;
                    }
                    //change sale price of related products
                    relatedProducts.forEach((product) => {
                        const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                        const newSalePrice = product.originalPrice - discountAmount;
                        if (!product.salePrice || product.salePrice > newSalePrice) {
                            product.salePrice = newSalePrice;
                        }
                    });
                }
            } else {
                if (isAlwaysApplyNewSalePrice) {
                    // Change sale price of current product
                    if (currentProgram.productIds?.map((id) => id.toString()).includes(currentProduct._id.toString())) {
                        const discountAmount = (currentProduct.originalPrice * currentProgram.discountPercentage) / 100;
                        const newSalePrice = currentProduct.originalPrice - discountAmount;
                        currentProduct.salePrice = newSalePrice;
                    }
                    //change sale price of related products
                    relatedProducts.forEach((product) => {
                        if (currentProgram.productIds?.map((id) => id.toString()).includes(product._id.toString())) {
                            const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                            const newSalePrice = product.originalPrice - discountAmount;
                            product.salePrice = newSalePrice;
                        }
                    });
                } else {
                    // Change sale price of current product
                    if (currentProgram.productIds?.map((id) => id.toString()).includes(currentProduct._id.toString())) {
                        const discountAmount = (currentProduct.originalPrice * currentProgram.discountPercentage) / 100;
                        const newSalePrice = currentProduct.originalPrice - discountAmount;
                        if (!currentProduct.salePrice || currentProduct.salePrice > newSalePrice) {
                            currentProduct.salePrice = newSalePrice;
                        }
                    }
                    //change sale price of related products
                    relatedProducts.forEach((product) => {
                        if (currentProgram.productIds?.map((id) => id.toString()).includes(product._id.toString())) {
                            const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                            const newSalePrice = product.originalPrice - discountAmount;
                            if (!product.salePrice || product.salePrice > newSalePrice) {
                                product.salePrice = newSalePrice;
                            }
                        }
                    });
                }
            }
        }

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy sản phẩm chi tiết thành công",
            data: {
                product: currentProduct,
                relatedProducts: relatedProducts,
            },
        });
    } catch (error) {
        res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const updateProduct: RequestHandler = async (req: Request<{ id: string } | ParamsDictionary, any, IProductData, ParsedQs>, res: Response) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        if (updateData.productColors) {
            let productQuantity = 0;
            updateData.productColors.forEach((color) => {
                productQuantity += color.quantity;
            });
            (updateData as any).stockQuantity = productQuantity;
        }

        const updatedProduct = await Products.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });

        if (!updatedProduct) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Sản phẩm đã bị xóa hoặc không tồn tại, vui lòng refresh lại dữ liệu mới nhất",
            });
        }

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Cập nhật sản phẩm thành công",
            data: updatedProduct,
        });
    } catch (error: any) {
        console.error(error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const deleteProduct: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const deletedProduct = await Products.findByIdAndDelete(id);

        if (!deletedProduct) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Sản phẩm đã bị xóa hoặc không tồn tại, vui lòng refresh lại dữ liệu mới nhất",
            });
        }

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Xóa sản phẩm thành công",
        });
    } catch (error: any) {
        console.error(error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const getProductsCountBySportType: RequestHandler = async (req: Request, res: Response) => {
    try {
        const sportTypeKeys = Object.keys(SportType).filter((key) => isNaN(Number(key)));
        const result = sportTypeKeys.map((key) => ({
            value: SportType[key as keyof typeof SportType],
            productCount: 0,
        }));

        const pipeline = [
            { $unwind: "$sportTypes" },
            {
                $group: {
                    _id: "$sportTypes",
                    productCount: { $sum: 1 },
                },
            },
        ];

        const aggregatedResult = await Products.aggregate(pipeline);

        aggregatedResult.forEach((item) => {
            const index = result.findIndex((resItem) => resItem.value === item._id);
            if (index !== -1) {
                result[index].productCount = item.productCount;
            }
        });

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy số lượng sản phẩm theo môn thể thao thành công",
            data: result,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const getTopSaleProducts: RequestHandler = async (req: Request, res: Response) => {
    try {
        const discountProgramList = await DiscountProgram.find({ status: DiscountStatus.Active }).lean();
        const currentProgram = discountProgramList[0];
        let topSaleProducts: any[] = [];
        if (currentProgram) {
            if (currentProgram.applyType === DiscountApplyType.SpecificProducts) {
                topSaleProducts = await Products.find({ _id: { $in: currentProgram.productIds?.map((id) => id.toString()) }, productVisibility: ProductVisibility.Visibility })
                    .limit(6)
                    .lean();
            } else {
                topSaleProducts = await Products.find({ productVisibility: ProductVisibility.Visibility }).limit(6).lean();
            }
        } else {
            topSaleProducts = [];
        }

        const clonedProduct = cloneDeep(topSaleProducts);

        if (currentProgram) {
            const isAlwaysApplyNewSalePrice = currentProgram.applySetting === ApplySetting.AlwaysApply;
            if (currentProgram.applyType === DiscountApplyType.AllProducts) {
                if (isAlwaysApplyNewSalePrice) {
                    clonedProduct.forEach((product) => {
                        const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                        const newSalePrice = product.originalPrice - discountAmount;
                        product.salePrice = newSalePrice;
                    });
                } else {
                    clonedProduct.forEach((product) => {
                        const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                        const newSalePrice = product.originalPrice - discountAmount;
                        if (!product.salePrice || product.salePrice > newSalePrice) {
                            product.salePrice = newSalePrice;
                        }
                    });
                }
            } else {
                if (isAlwaysApplyNewSalePrice) {
                    clonedProduct.forEach((product) => {
                        if (currentProgram.productIds?.map((id) => id.toString()).includes(product._id.toString())) {
                            const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                            const newSalePrice = product.originalPrice - discountAmount;
                            product.salePrice = newSalePrice;
                        }
                    });
                } else {
                    clonedProduct.forEach((product) => {
                        if (currentProgram.productIds?.map((id) => id.toString()).includes(product._id.toString())) {
                            const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                            const newSalePrice = product.originalPrice - discountAmount;
                            if (!product.salePrice || product.salePrice > newSalePrice) {
                                product.salePrice = newSalePrice;
                            }
                        }
                    });
                }
            }
        }

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy danh sách sản phẩm giảm giá lớn nhất thành công",
            data: {
                topSaleProducts: clonedProduct,
                currentProgramInfo: currentProgram,
            },
        });
    } catch (error: any) {
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const getBestSellerProducts: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { ...filters } = req.query;

        const mongoFilter: { [key: string]: Object } = {};
        for (const key in filters) {
            const value = filters[key];
            const items = Array.isArray(value) ? value.map(Number) : [Number(value)];
            mongoFilter[key] = { $in: items };
        }
        mongoFilter.productVisibility = ProductVisibility.Visibility;
        const pipeline: PipelineStage[] = [];
        if (Object.keys(mongoFilter).length > 0) {
            pipeline.push({
                $match: mongoFilter,
            });
        }
        pipeline.push(
            {
                $sort: { saleQuantity: -1 as 1 | -1 },
            },
            {
                $limit: 10,
            }
        );

        let topSaleProducts = await Products.aggregate(pipeline);

        const discountProgramList = await DiscountProgram.find({ status: DiscountStatus.Active }).lean();
        const currentProgram = discountProgramList[0];

        if (currentProgram) {
            const isAlwaysApplyNewSalePrice = currentProgram.applySetting === ApplySetting.AlwaysApply;
            if (currentProgram.applyType === DiscountApplyType.AllProducts) {
                if (isAlwaysApplyNewSalePrice) {
                    topSaleProducts.forEach((product) => {
                        const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                        const newSalePrice = product.originalPrice - discountAmount;
                        product.salePrice = newSalePrice;
                    });
                } else {
                    topSaleProducts.forEach((product) => {
                        const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                        const newSalePrice = product.originalPrice - discountAmount;
                        if (!product.salePrice || product.salePrice > newSalePrice) {
                            product.salePrice = newSalePrice;
                        }
                    });
                }
            } else {
                if (isAlwaysApplyNewSalePrice) {
                    topSaleProducts.forEach((product) => {
                        if (currentProgram.productIds?.map((id) => id.toString()).includes(product._id.toString())) {
                            const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                            const newSalePrice = product.originalPrice - discountAmount;
                            product.salePrice = newSalePrice;
                        }
                    });
                } else {
                    topSaleProducts.forEach((product) => {
                        if (currentProgram.productIds?.map((id) => id.toString()).includes(product._id.toString())) {
                            const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                            const newSalePrice = product.originalPrice - discountAmount;
                            if (!product.salePrice || product.salePrice > newSalePrice) {
                                product.salePrice = newSalePrice;
                            }
                        }
                    });
                }
            }
        }

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy danh sách sản phẩm bán chạy nhất thành công",
            data: topSaleProducts,
        });
    } catch (error: any) {
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const getTopSaleProductsByGender: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { gender } = req.query;
        const pipeline: PipelineStage[] = [];

        if (gender) {
            const genderValue = parseInt(gender as string);
            if (!isNaN(genderValue)) {
                pipeline.push({
                    $match: {
                        productGender: genderValue,
                        productVisibility: ProductVisibility.Visibility,
                    },
                });
            }
        }

        pipeline.push(
            {
                $sort: { saleQuantity: -1 as 1 | -1 },
            },
            {
                $limit: 10,
            }
        );

        let topSaleProducts = await Products.aggregate(pipeline);

        const discountProgramList = await DiscountProgram.find({ status: DiscountStatus.Active }).lean();
        const currentProgram = discountProgramList[0];

        if (currentProgram) {
            const isAlwaysApplyNewSalePrice = currentProgram.applySetting === ApplySetting.AlwaysApply;
            if (currentProgram.applyType === DiscountApplyType.AllProducts) {
                if (isAlwaysApplyNewSalePrice) {
                    topSaleProducts.forEach((product) => {
                        const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                        const newSalePrice = product.originalPrice - discountAmount;
                        product.salePrice = newSalePrice;
                    });
                } else {
                    topSaleProducts.forEach((product) => {
                        const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                        const newSalePrice = product.originalPrice - discountAmount;
                        if (!product.salePrice || product.salePrice > newSalePrice) {
                            product.salePrice = newSalePrice;
                        }
                    });
                }
            } else {
                if (isAlwaysApplyNewSalePrice) {
                    topSaleProducts.forEach((product) => {
                        if (currentProgram.productIds?.map((id) => id.toString()).includes(product._id.toString())) {
                            const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                            const newSalePrice = product.originalPrice - discountAmount;
                            product.salePrice = newSalePrice;
                        }
                    });
                } else {
                    topSaleProducts.forEach((product) => {
                        if (currentProgram.productIds?.map((id) => id.toString()).includes(product._id.toString())) {
                            const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                            const newSalePrice = product.originalPrice - discountAmount;
                            if (!product.salePrice || product.salePrice > newSalePrice) {
                                product.salePrice = newSalePrice;
                            }
                        }
                    });
                }
            }
        }

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy danh sách sản phẩm bán chạy nhất thành công",
            data: topSaleProducts,
        });
    } catch (error: any) {
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const addFavoriteProduct: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { productId } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).send({
                status: IResponseStatus.Error,
                message: "Người dùng chưa được xác thực",
            });
        }

        if (!productId) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "Vui lòng cung cấp ID sản phẩm",
            });
        }

        const existingFavorite = await FavoriteProducts.findOne({
            user: userId,
            product: productId,
        });

        if (existingFavorite) {
            return res.status(409).send({
                status: IResponseStatus.Error,
                message: "Sản phẩm đã có trong danh sách yêu thích",
            });
        }

        const newFavorite: IFavoriteProducts = new FavoriteProducts({
            user: userId,
            product: productId,
        });

        await newFavorite.save();

        return res.status(201).send({
            status: IResponseStatus.Success,
            message: "Thêm sản phẩm vào danh sách yêu thích thành công",
        });
    } catch (error: any) {
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const removeFavoriteProduct: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { productId } = req.body;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).send({
                status: IResponseStatus.Error,
                message: "Người dùng chưa được xác thực",
            });
        }

        if (!productId) {
            return res.status(400).send({
                status: IResponseStatus.Error,
                message: "Vui lòng cung cấp ID sản phẩm",
            });
        }

        const deletedFavorite = await FavoriteProducts.findOneAndDelete({
            user: userId,
            product: productId,
        });

        if (!deletedFavorite) {
            return res.status(404).send({
                status: IResponseStatus.Error,
                message: "Sản phẩm không có trong danh sách yêu thích",
            });
        }

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Xóa sản phẩm khỏi danh sách yêu thích thành công",
        });
    } catch (error: any) {
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const getFavoriteProducts: RequestHandler = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).send({
                status: IResponseStatus.Error,
                message: "Người dùng chưa được xác thực",
            });
        }
        const productsData = await FavoriteProducts.aggregate([
            {
                $match: { user: new mongoose.Types.ObjectId(userId) },
            },
            {
                $lookup: {
                    from: "products",
                    localField: "product",
                    foreignField: "_id",
                    as: "productDetails",
                },
            },
            {
                $unwind: "$productDetails",
            },
            {
                $replaceRoot: { newRoot: "$productDetails" },
            },
        ]);

        const discountProgramList = await DiscountProgram.find({ status: DiscountStatus.Active }).lean();
        const currentProgram = discountProgramList[0];

        if (currentProgram) {
            const isAlwaysApplyNewSalePrice = currentProgram.applySetting === ApplySetting.AlwaysApply;
            if (currentProgram.applyType === DiscountApplyType.AllProducts) {
                if (isAlwaysApplyNewSalePrice) {
                    productsData.forEach((product) => {
                        const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                        const newSalePrice = product.originalPrice - discountAmount;
                        product.salePrice = newSalePrice;
                    });
                } else {
                    productsData.forEach((product) => {
                        const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                        const newSalePrice = product.originalPrice - discountAmount;
                        if (!product.salePrice || product.salePrice > newSalePrice) {
                            product.salePrice = newSalePrice;
                        }
                    });
                }
            } else {
                if (isAlwaysApplyNewSalePrice) {
                    productsData.forEach((product) => {
                        if (currentProgram.productIds?.map((id) => id.toString()).includes(product._id.toString())) {
                            const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                            const newSalePrice = product.originalPrice - discountAmount;
                            product.salePrice = newSalePrice;
                        }
                    });
                } else {
                    productsData.forEach((product) => {
                        if (currentProgram.productIds?.map((id) => id.toString()).includes(product._id.toString())) {
                            const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                            const newSalePrice = product.originalPrice - discountAmount;
                            if (!product.salePrice || product.salePrice > newSalePrice) {
                                product.salePrice = newSalePrice;
                            }
                        }
                    });
                }
            }
        }

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy danh sách sản phẩm yêu thích thành công",
            data: productsData,
        });
    } catch (error: any) {
        return res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

const searchProduct: RequestHandler = async (req: Request, res: Response) => {
    try {
        const { search, page = "1", limit = "10" } = req.query;
        const { userId } = req.body;
        const convertPage = parseInt(page as string);
        const convertLimit = parseInt(limit as string);
        const mongoFilter: { [key: string]: Object } = {};
        if (search) {
            mongoFilter.$text = { $search: String(search) };
        }
        mongoFilter.productVisibility = ProductVisibility.Visibility;
        const skip = (convertPage - 1) * convertLimit;
        let query = Products.find(mongoFilter).sort({ createdAt: -1 });
        let products = await query.skip(skip).limit(convertLimit).lean();

        const totalCounts = await Products.countDocuments(mongoFilter);

        const discountProgramList = await DiscountProgram.find({ status: DiscountStatus.Active }).lean();
        const currentProgram = discountProgramList[0];

        if (currentProgram) {
            const isAlwaysApplyNewSalePrice = currentProgram.applySetting === ApplySetting.AlwaysApply;
            if (currentProgram.applyType === DiscountApplyType.AllProducts) {
                if (isAlwaysApplyNewSalePrice) {
                    products.forEach((product) => {
                        const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                        const newSalePrice = product.originalPrice - discountAmount;
                        product.salePrice = newSalePrice;
                    });
                } else {
                    products.forEach((product) => {
                        const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                        const newSalePrice = product.originalPrice - discountAmount;
                        if (!product.salePrice || product.salePrice > newSalePrice) {
                            product.salePrice = newSalePrice;
                        }
                    });
                }
            } else {
                if (isAlwaysApplyNewSalePrice) {
                    products.forEach((product) => {
                        if (currentProgram.productIds?.map((id) => id.toString()).includes(product._id.toString())) {
                            const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                            const newSalePrice = product.originalPrice - discountAmount;
                            product.salePrice = newSalePrice;
                        }
                    });
                } else {
                    products.forEach((product) => {
                        if (currentProgram.productIds?.map((id) => id.toString()).includes(product._id.toString())) {
                            const discountAmount = (product.originalPrice * currentProgram.discountPercentage) / 100;
                            const newSalePrice = product.originalPrice - discountAmount;
                            if (!product.salePrice || product.salePrice > newSalePrice) {
                                product.salePrice = newSalePrice;
                            }
                        }
                    });
                }
            }
        }

        if (search) {
            const searchValue = String(search);

            const newSearchHistory = new SearchHistory({
                userId: userId && mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null,
                searchValue: searchValue,
                isHidden: false,
            });

            await newSearchHistory.save();
        }

        return res.status(200).send({
            status: IResponseStatus.Success,
            message: "Lấy sản phẩm thành công",
            data: {
                products,
                totalCounts,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).send({
            status: IResponseStatus.Error,
            message: "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau",
        });
    }
};

export {
    createNewProduct,
    getProducts,
    getProductDetails,
    updateProduct,
    deleteProduct,
    getProductsCountBySportType,
    getTopSaleProducts,
    getTopSaleProductsByGender,
    addFavoriteProduct,
    removeFavoriteProduct,
    getFavoriteProducts,
    getProductListById,
    getProductsByName,
    getBestSellerProducts,
    searchProduct,
};
