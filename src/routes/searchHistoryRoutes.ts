/** @format */

import express from "express";
import { getRecentSearches, getTopSearches, removeSearchHistory } from "../controllers/searchHistory.controller";

const searchHistoryRoutes = express.Router();

searchHistoryRoutes.get("/get-recently-search/:userId", getRecentSearches);
searchHistoryRoutes.get("/get-top-search", getTopSearches);
searchHistoryRoutes.put("/remove-search-history", removeSearchHistory);

export default searchHistoryRoutes;
