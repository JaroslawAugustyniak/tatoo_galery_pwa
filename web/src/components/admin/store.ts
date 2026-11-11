import type { CategoryDTO } from "@/lib/types";
import type { Dispatch, SetStateAction } from "react";

/** Dane galerii zalogowanego tatuatora współdzielone przez widoki panelu. */
export type GalleryStore = {
  slug: string;
  categories: CategoryDTO[];
  /** do optymistycznych aktualizacji (zmiana kolejności) */
  setCategories: Dispatch<SetStateAction<CategoryDTO[]>>;
  reload: () => Promise<void>;
};
