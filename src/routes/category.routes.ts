// Category routes — public list
import { Router } from "express";
import { listCategoriesController } from "../controllers/category.controller.js";

const router = Router();
router.get("/", listCategoriesController);
export default router;
