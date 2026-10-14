import type { components } from './schema';

/** Types des contenus publics de l'API (générés depuis l'OpenAPI), utilisables partout. */
export type Schemas = components['schemas'];
export type SiteSettings = Schemas['PublicSiteSettingsDto'];
export type HomeContent = Schemas['PublicHomeDto'];
export type ReviewList = Schemas['ReviewListDto'];
export type Review = Schemas['ReviewDto'];
export type FaqList = Schemas['FaqListDto'];
export type FaqItem = Schemas['FaqItemDto'];
export type StaticPage = Schemas['PageDto'];
export type PageLink = Schemas['PageLinkDto'];
export type ArticleList = Schemas['ArticleListDto'];
export type ArticleCard = Schemas['ArticleCardDto'];
export type Article = Schemas['ArticleDetailDto'];
export type ArticleCategory = Schemas['CategoryDto'];
export type TocEntry = Schemas['TocEntryDto'];
export type PublicImage = Schemas['PublicImageDto'];
export type CateringCatalog = Schemas['CateringCatalogDto'];
export type CateringCategory = Schemas['CateringCategoryDto'];
export type CateringProduct = Schemas['CateringProductCardDto'];
export type CateringVariant = Schemas['CateringVariantDto'];
export type CateringConditions = Schemas['CateringConditionsDto'];
export type CateringReceipt = Schemas['CateringRequestReceiptDto'];
export type CateringSlot = Schemas['CateringSlotDto'];
export type Flavour = Schemas['FlavourDto'];
