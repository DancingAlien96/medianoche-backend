import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CONTRA_ENTREGA: 'Pago contra entrega',
  TRANSFERENCIA: 'Transferencia bancaria',
  VISA_CUOTAS: 'Visa cuotas',
};

function formatQ(cents: number): string {
  return `Q${(cents / 100).toFixed(2)}`;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async create(userId: string, userEmail: string, dto: CreateOrderDto) {
    const cartItems = await this.prisma.cartItem.findMany({
      where: { userId },
      include: { product: true },
      orderBy: { createdAt: 'asc' },
    });
    if (cartItems.length === 0) {
      throw new BadRequestException('El carrito está vacío');
    }

    const subtotalCents = cartItems.reduce(
      (sum, item) => sum + item.product.priceCents * item.quantity,
      0,
    );
    const shippingCents = Number(this.config.get('SHIPPING_CENTS') ?? 3500);
    const totalCents = subtotalCents + shippingCents;

    // Create the order (snapshotting items), decrement stock, and empty the
    // cart — all atomically.
    const order = await this.prisma.$transaction(async (tx) => {
      // Decrement stock with a guard against overselling: updateMany only
      // matches when there is enough stock, so count === 0 means insufficient.
      for (const item of cartItems) {
        const updated = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (updated.count === 0) {
          throw new BadRequestException(
            `Stock insuficiente para "${item.product.name}". Ajusta la cantidad en tu carrito.`,
          );
        }
      }

      const created = await tx.order.create({
        data: {
          userId,
          status: OrderStatus.PENDING,
          customerName: dto.customerName,
          phone: dto.phone,
          address: dto.address,
          city: dto.city,
          notes: dto.notes,
          paymentMethod: dto.paymentMethod,
          subtotalCents,
          shippingCents,
          totalCents,
          items: {
            create: cartItems.map((item) => ({
              productId: item.productId,
              productName: item.product.name,
              priceCents: item.product.priceCents,
              quantity: item.quantity,
              imageUrl: item.product.imageUrl,
            })),
          },
        },
        include: { items: true },
      });
      await tx.cartItem.deleteMany({ where: { userId } });
      return created;
    });

    // Send notifications without blocking the response on email delivery.
    void this.sendOrderEmails(order, userEmail);

    return order;
  }

  findMine(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: { id: string; role: string }) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }
    if (order.userId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException();
    }
    return order;
  }

  findAllAdmin() {
    return this.prisma.order.findMany({
      include: {
        items: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(id: string, status: OrderStatus) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }
    return this.prisma.order.update({
      where: { id },
      data: { status },
      include: { items: true },
    });
  }

  /* ---------------- Emails ---------------- */

  private async sendOrderEmails(order: OrderWithItems, customerEmail: string) {
    const storeEmail =
      this.config.get<string>('ORDER_NOTIFICATION_EMAIL') ??
      'pedidos@medianoche.com';

    await Promise.all([
      this.mail.send(
        storeEmail,
        `🛍️ Nuevo pedido #${order.id.slice(-6).toUpperCase()} — ${formatQ(order.totalCents)}`,
        this.buildOrderHtml(order, { forStore: true, customerEmail }),
      ),
      this.mail.send(
        customerEmail,
        `Confirmación de tu pedido en Medianoche #${order.id.slice(-6).toUpperCase()}`,
        this.buildOrderHtml(order, { forStore: false, customerEmail }),
      ),
    ]);
  }

  private buildOrderHtml(
    order: OrderWithItems,
    opts: { forStore: boolean; customerEmail: string },
  ): string {
    const rows = order.items
      .map(
        (item) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">
            ${item.productName} <span style="color:#888;">× ${item.quantity}</span>
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">
            ${formatQ(item.priceCents * item.quantity)}
          </td>
        </tr>`,
      )
      .join('');

    const heading = opts.forStore
      ? 'Nuevo pedido recibido'
      : '¡Gracias por tu pedido!';
    const intro = opts.forStore
      ? 'Se registró un nuevo pedido en la tienda:'
      : 'Hemos recibido tu pedido. Te contactaremos para coordinar la entrega y el pago.';

    return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1d1a12;">
      <h2 style="color:#bc5632;margin-bottom:4px;">Medianoche</h2>
      <h3 style="margin-top:0;">${heading}</h3>
      <p style="color:#555;">${intro}</p>

      <p><strong>Pedido:</strong> #${order.id.slice(-6).toUpperCase()}</p>

      <table style="width:100%;border-collapse:collapse;margin:12px 0;">
        ${rows}
        <tr>
          <td style="padding:8px 0;text-align:right;color:#555;">Subtotal</td>
          <td style="padding:8px 0;text-align:right;">${formatQ(order.subtotalCents)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;text-align:right;color:#555;">Envío</td>
          <td style="padding:4px 0;text-align:right;">${formatQ(order.shippingCents)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;text-align:right;font-weight:bold;">Total</td>
          <td style="padding:8px 0;text-align:right;font-weight:bold;color:#bc5632;">${formatQ(order.totalCents)}</td>
        </tr>
      </table>

      <h4 style="margin-bottom:4px;">Datos de entrega</h4>
      <p style="margin:2px 0;">${order.customerName}</p>
      <p style="margin:2px 0;">${order.phone}</p>
      <p style="margin:2px 0;">${order.address}, ${order.city}</p>
      ${order.notes ? `<p style="margin:2px 0;color:#555;">Notas: ${order.notes}</p>` : ''}
      <p style="margin:8px 0 2px;"><strong>Método de pago:</strong> ${PAYMENT_LABELS[order.paymentMethod]}</p>
      ${opts.forStore ? `<p style="margin:2px 0;color:#555;">Cliente: ${opts.customerEmail}</p>` : ''}

      <p style="color:#999;font-size:12px;margin-top:24px;">Medianoche — Relojes, accesorios y perfumes.</p>
    </div>`;
  }
}
