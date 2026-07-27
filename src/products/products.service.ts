import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateProductDto } from './dto/update-product.dto';

// Reserved, protected category used as the "no category" bucket.
const UNCATEGORIZED_SLUG = 'sin-categoria';

@Injectable()
export class ProductsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Make sure the protected "Sin categoría" bucket always exists.
    await this.ensureUncategorized();
  }

  async findAll(query: QueryProductsDto) {
    const { page, limit } = query;

    const where: Prisma.ProductWhereInput = {};
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.category) {
      where.category = { slug: query.category };
    }

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { category: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async findCategories() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
  }

  /* ---------------- Admin: category management ---------------- */

  async createCategory(dto: CreateCategoryDto) {
    const name = dto.name.trim();
    const existing = await this.prisma.category.findUnique({ where: { name } });
    if (existing) {
      throw new ConflictException('Ya existe una categoría con ese nombre');
    }
    const slug = await this.uniqueCategorySlug(this.slugify(name));
    return this.prisma.category.create({ data: { name, slug } });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }
    if (category.slug === UNCATEGORIZED_SLUG) {
      throw new BadRequestException(
        'La categoría "Sin categoría" no se puede renombrar',
      );
    }
    const name = dto.name.trim();
    const duplicate = await this.prisma.category.findUnique({ where: { name } });
    if (duplicate && duplicate.id !== id) {
      throw new ConflictException('Ya existe una categoría con ese nombre');
    }
    const slug = await this.uniqueCategorySlug(this.slugify(name), id);
    return this.prisma.category.update({
      where: { id },
      data: { name, slug },
    });
  }

  async deleteCategory(id: string, reassignToId?: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }
    if (category.slug === UNCATEGORIZED_SLUG) {
      throw new BadRequestException(
        'La categoría "Sin categoría" no se puede eliminar',
      );
    }

    if (category._count.products > 0) {
      if (!reassignToId) {
        throw new BadRequestException(
          'Elige una categoría destino para mover los productos.',
        );
      }
      if (reassignToId === id) {
        throw new BadRequestException(
          'La categoría destino debe ser diferente.',
        );
      }
      const target = await this.prisma.category.findUnique({
        where: { id: reassignToId },
      });
      if (!target) {
        throw new BadRequestException('Categoría destino no encontrada.');
      }

      // Move products to the target category, then delete — atomically.
      await this.prisma.$transaction([
        this.prisma.product.updateMany({
          where: { categoryId: id },
          data: { categoryId: reassignToId },
        }),
        this.prisma.category.delete({ where: { id } }),
      ]);
      return { success: true, movedTo: target.name };
    }

    await this.prisma.category.delete({ where: { id } });
    return { success: true };
  }

  /** Ensure the protected "Sin categoría" bucket exists; returns it. */
  async ensureUncategorized() {
    return this.prisma.category.upsert({
      where: { slug: UNCATEGORIZED_SLUG },
      update: {},
      create: { name: 'Sin categoría', slug: UNCATEGORIZED_SLUG },
    });
  }

  private async uniqueCategorySlug(
    base: string,
    excludeId?: string,
  ): Promise<string> {
    let slug = base;
    let counter = 1;
    for (;;) {
      const existing = await this.prisma.category.findUnique({
        where: { slug },
      });
      if (!existing || existing.id === excludeId) return slug;
      counter += 1;
      slug = `${base}-${counter}`;
    }
  }

  /* ---------------- Admin: create / update / delete ---------------- */

  async create(dto: CreateProductDto) {
    await this.assertCategoryExists(dto.categoryId);
    const slug = await this.uniqueSlug(this.slugify(dto.name));
    return this.prisma.product.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        priceCents: dto.priceCents,
        imageUrl: dto.images[0],
        images: dto.images,
        stock: dto.stock,
        categoryId: dto.categoryId,
      },
      include: { category: true },
    });
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);
    if (dto.categoryId) await this.assertCategoryExists(dto.categoryId);

    const data: Prisma.ProductUpdateInput = {
      name: dto.name,
      description: dto.description,
      priceCents: dto.priceCents,
      stock: dto.stock,
    };
    if (dto.images) {
      data.images = dto.images;
      data.imageUrl = dto.images[0]; // keep cover in sync
    }
    if (dto.categoryId) {
      data.category = { connect: { id: dto.categoryId } };
    }
    if (dto.name) {
      data.slug = await this.uniqueSlug(this.slugify(dto.name), id);
    }

    return this.prisma.product.update({
      where: { id },
      data,
      include: { category: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.product.delete({ where: { id } });
    return { success: true };
  }

  private async assertCategoryExists(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      throw new BadRequestException('Category not found');
    }
  }

  private slugify(value: string): string {
    return (
      value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'producto'
    );
  }

  private async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    let slug = base;
    let counter = 1;
    for (;;) {
      const existing = await this.prisma.product.findUnique({
        where: { slug },
      });
      if (!existing || existing.id === excludeId) return slug;
      counter += 1;
      slug = `${base}-${counter}`;
    }
  }
}
