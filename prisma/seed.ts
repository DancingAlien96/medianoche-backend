import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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
  priceCents: number; // in GTQ cents (Q1 = 100)
  stock: number;
  imageUrl: string;
  categorySlug: string;
};

// Products from "Catálogo De Temporada JUNIO 2026" (@Medianochegt). Prices in GTQ.
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

async function main() {
  console.log('Seeding database...');

  // Fresh catalog: clear cart items and products/categories (users are kept).
  await prisma.cartItem.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();

  const categoryBySlug = new Map<string, string>();
  for (const category of categories) {
    const record = await prisma.category.create({ data: category });
    categoryBySlug.set(category.slug, record.id);
  }
  console.log(`  ${categories.length} categories`);

  for (const product of products) {
    const categoryId = categoryBySlug.get(product.categorySlug);
    if (!categoryId) continue;
    await prisma.product.create({
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
  console.log(`  ${products.length} products`);

  // Demo customer
  const demoPassword = await bcrypt.hash('password123', 10);
  await prisma.user.upsert({
    where: { email: 'demo@medianoche.com' },
    update: {},
    create: {
      email: 'demo@medianoche.com',
      name: 'Demo User',
      password: demoPassword,
    },
  });
  console.log('  demo customer (demo@medianoche.com / password123)');

  // Admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@medianoche.com' },
    update: { role: 'ADMIN' },
    create: {
      email: 'admin@medianoche.com',
      name: 'Administrador',
      password: adminPassword,
      role: 'ADMIN',
    },
  });
  console.log('  admin user (admin@medianoche.com / admin123)');

  console.log('Seeding complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
