// Category controller — thin
import type { Request, Response, NextFunction } from "express";
import { listCategoriesService } from "../services/category.service.js";

export async function listCategoriesController(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listCategoriesService();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
