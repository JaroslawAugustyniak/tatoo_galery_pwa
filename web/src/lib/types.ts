export type ArtworkDTO = {
  id: string;
  title: string | null;
  displayUrl: string;
  blurDataUrl: string | null;
  order: number;
};

export type CategoryDTO = {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string;
  artworks: ArtworkDTO[];
};

export type Me = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
};

export type GalleryDTO = {
  name: string;
  slug: string;
  logoUrl: string | null;
  categories: CategoryDTO[];
};
