import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

const categories = [
  { name: 'Relojes', slug: 'relojes' },
  { name: 'Accesorios', slug: 'accesorios' },
  { name: 'Perfumes', slug: 'perfumes' },
  { name: 'Detalles', slug: 'detalles' },
];

type SeedProduct = {
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  stock: number;
  imageUrl: string;
  categorySlug: string;
};

// Initial catalog (images live in the frontend's /public/products/*.png).
const products: SeedProduct[] = [
  {
    name: 'Reloj Citizen Nighthawk',
    slug: 'citizen-nighthawk',
    description:
      'Tamaño de la caja: 43MM. Movimiento: Cronógrafo de cuarzo. Material de la correa: Acero inoxidable.',
    priceCents: 260000,
    stock: 1,
    imageUrl: '/products/citizen-nighthawk.png',
    categorySlug: 'relojes',
  },
  {
    name: 'Reloj Cronógrafo Fenmore (Cuero)',
    slug: 'fenmore-cuero',
    description:
      'Tamaño de la caja: 44MM. Movimiento: Cronógrafo de cuarzo. Material de la correa: Cuero.',
    priceCents: 125000,
    stock: 2,
    imageUrl: '/products/fenmore-cuero.png',
    categorySlug: 'relojes',
  },
  {
    name: 'Reloj Cronógrafo Flynn',
    slug: 'flynn',
    description:
      'Tamaño de la caja: 48MM. Movimiento: Cronógrafo de cuarzo. Material de la correa: Cuero.',
    priceCents: 125000,
    stock: 1,
    imageUrl: '/products/flynn.png',
    categorySlug: 'relojes',
  },
  {
    name: 'Reloj Cronógrafo Fenmore (Metal)',
    slug: 'fenmore-metal',
    description:
      'Tamaño de la caja: 44MM. Movimiento: Cronógrafo de cuarzo. Material de la correa: Metal.',
    priceCents: 125000,
    stock: 1,
    imageUrl: '/products/fenmore-metal.png',
    categorySlug: 'relojes',
  },
  {
    name: 'Reloj Rhett Doble Correa',
    slug: 'rhett-doble-correa',
    description:
      'Tamaño de la caja: 43MM. Movimiento: Cronógrafo de cuarzo. Material de la correa: Metal / Cuero.',
    priceCents: 190000,
    stock: 1,
    imageUrl: '/products/rhett-doble-correa.png',
    categorySlug: 'relojes',
  },
  {
    name: 'Dúo de Relojes His & Her',
    slug: 'his-and-her',
    description:
      'Tamaño de la caja: 44mm / 34mm. Movimiento: Cronógrafo de cuarzo. Material de la correa: Metal.',
    priceCents: 250000,
    stock: 1,
    imageUrl: '/products/his-and-her.png',
    categorySlug: 'relojes',
  },
  {
    name: 'Reloj Rhett Multifunción',
    slug: 'rhett-multifuncion',
    description:
      'Tamaño de la caja: 42MM. Movimiento: Cuarzo multifunción. Material de la correa: Metal.',
    priceCents: 125000,
    stock: 1,
    imageUrl: '/products/rhett-multifuncion.png',
    categorySlug: 'relojes',
  },
  {
    name: 'Reloj Armani Exchange',
    slug: 'armani-exchange',
    description:
      'Tamaño de la caja: 42MM. Movimiento: Cuarzo multifunción. Material de la correa: Metal.',
    priceCents: 125000,
    stock: 1,
    imageUrl: '/products/armani-exchange.png',
    categorySlug: 'relojes',
  },
  {
    name: 'Caja de Relojes Espresso (Grande)',
    slug: 'caja-relojes-grande',
    description:
      'Color: Espresso. Material: Piel sintética, vidrio, metal y terciopelo. Estilo moderno. Dimensiones: 12.8 x 8 x 3.4 pulgadas.',
    priceCents: 80000,
    stock: 1,
    imageUrl: '/products/caja-relojes-grande.png',
    categorySlug: 'accesorios',
  },
  {
    name: 'Caja de Relojes Espresso (Mediana)',
    slug: 'caja-relojes-mediana',
    description:
      'Color: Espresso. Material: Piel sintética, vidrio, metal y terciopelo. Estilo moderno. Dimensiones: 13.39" x 7.48" x 5.91". Disponible bajo pedido.',
    priceCents: 55000,
    stock: 1,
    imageUrl: '/products/caja-relojes-mediana.png',
    categorySlug: 'accesorios',
  },
];

/**
 * Seeds the initial catalog on startup ONLY when the products table is empty.
 * Safe for production: it never deletes or overwrites existing data, so it runs
 * once on the first deploy and is skipped forever after. Disable with AUTO_SEED=false.
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.get<string>('AUTO_SEED') === 'false') return;

    const count = await this.prisma.product.count();
    if (count > 0) {
      this.logger.log(`Seed skipped: ${count} products already exist.`);
      return;
    }

    this.logger.warn('Products table is empty — seeding initial catalog...');
    await this.seedCatalog();
  }

  private async seedCatalog() {
    const idBySlug = new Map<string, string>();
    for (const category of categories) {
      const record = await this.prisma.category.upsert({
        where: { slug: category.slug },
        update: { name: category.name },
        create: category,
      });
      idBySlug.set(category.slug, record.id);
    }

    for (const product of products) {
      const categoryId = idBySlug.get(product.categorySlug);
      if (!categoryId) continue;
      await this.prisma.product.create({
        data: {
          name: product.name,
          slug: product.slug,
          description: product.description,
          priceCents: product.priceCents,
          stock: product.stock,
          imageUrl: product.imageUrl,
          images: [product.imageUrl],
          categoryId,
        },
      });
    }

    // Admin account (configurable via env for production security).
    const adminEmail =
      this.config.get<string>('ADMIN_EMAIL') ?? 'admin@medianoche.com';
    const adminPassword =
      this.config.get<string>('ADMIN_PASSWORD') ?? 'admin123';
    await this.prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: 'ADMIN' },
      create: {
        email: adminEmail,
        name: 'Administrador',
        password: await bcrypt.hash(adminPassword, 10),
        role: 'ADMIN',
      },
    });

    this.logger.log(
      `Seed complete: ${categories.length} categories, ${products.length} products, admin=${adminEmail}`,
    );
  }
}
