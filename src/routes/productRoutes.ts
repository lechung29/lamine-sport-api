/** @format */

import express from "express";
import {
    addFavoriteProduct,
    createNewProduct,
    deleteProduct,
    getBestSellerProducts,
    getFavoriteProducts,
    getProductDetails,
    getProductListById,
    getProducts,
    getProductsByName,
    getProductsCountBySportType,
    getTopSaleProducts,
    getTopSaleProductsByGender,
    removeFavoriteProduct,
    searchProduct,
    updateProduct,
} from "../controllers/product.controller";
import { isAdmin, isLocked, verifyToken } from "../middlewares/auth";

const productRouter = express.Router();

productRouter.post("/create", verifyToken, isAdmin, createNewProduct);
productRouter.get("/get-products", getProducts);
productRouter.get("/get-product-details/:productId", getProductDetails);
productRouter.put("/update/:id", verifyToken, isAdmin, updateProduct);
productRouter.delete("/delete/:id", verifyToken, isAdmin, deleteProduct);
productRouter.get("/get-sport-type", getProductsCountBySportType);

productRouter.post("/add-favorite", verifyToken, isLocked, addFavoriteProduct);
productRouter.post("/remove-favorite", verifyToken, isLocked, removeFavoriteProduct);
productRouter.get("/get-favorite-products", verifyToken, isLocked, getFavoriteProducts);
productRouter.get("/get-top-sale", getTopSaleProducts);
productRouter.get("/get-best-seller", getBestSellerProducts);
productRouter.get("/get-top-sale-by-gender", getTopSaleProductsByGender);

productRouter.post("/get-list-by-id", verifyToken, isAdmin, getProductListById);
productRouter.get("/get-by-name", getProductsByName);
productRouter.post("/get-by-search", searchProduct);

export default productRouter;
