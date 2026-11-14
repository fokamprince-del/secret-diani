-- Type d'événement des demandes traiteur et allergènes des produits (INCO, 14 allergènes).
-- CreateEnum
CREATE TYPE "catering_occasion" AS ENUM ('wedding', 'birthday', 'baptism', 'corporate', 'other');

-- CreateEnum
CREATE TYPE "catering_allergen" AS ENUM ('gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs');

-- AlterTable
ALTER TABLE "catering_products" ADD COLUMN     "allergens" "catering_allergen"[] DEFAULT ARRAY[]::"catering_allergen"[];

-- AlterTable
ALTER TABLE "catering_requests" ADD COLUMN     "occasion" "catering_occasion";


