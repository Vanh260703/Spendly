'use client';

import {
  Baby, Beer, BookOpen, Briefcase, Bus, Cake, Car, CircleEllipsis, Coffee,
  CreditCard, CupSoda, Dog, Droplet, Dumbbell, Film, Fuel, Gamepad2, Gift,
  GraduationCap, Heart, HeartPulse, House, Landmark, Laptop, Music, PiggyBank,
  Pill, Plane, Receipt, Scale, Scissors, Shirt, ShoppingBag, Smartphone, Target,
  Ticket, Train, TrendingUp, Users, Utensils, Wallet, Wifi, Zap,
} from 'lucide-react';

/**
 * Bảng icon dùng cho danh mục.
 *
 * Cố ý **liệt kê tường minh** thay vì `import * as Icons from 'lucide-react'`:
 * lucide có hàng nghìn icon, import cả gói sẽ phình bundle lên rất nhiều trong khi
 * app chỉ dùng vài chục cái.
 *
 * Khóa là tên kebab-case đúng như giá trị lưu trong DB (`category.icon`).
 */
export const CATEGORY_ICONS = {
  // Ăn uống
  utensils: Utensils,
  coffee: Coffee,
  'cup-soda': CupSoda,
  beer: Beer,
  cake: Cake,
  // Đi lại
  car: Car,
  bus: Bus,
  train: Train,
  plane: Plane,
  fuel: Fuel,
  // Nhà cửa & hóa đơn
  house: House,
  receipt: Receipt,
  zap: Zap,
  droplet: Droplet,
  wifi: Wifi,
  smartphone: Smartphone,
  // Sức khỏe & học hành
  'heart-pulse': HeartPulse,
  pill: Pill,
  dumbbell: Dumbbell,
  'graduation-cap': GraduationCap,
  'book-open': BookOpen,
  // Mua sắm & giải trí
  'shopping-bag': ShoppingBag,
  shirt: Shirt,
  'gamepad-2': Gamepad2,
  film: Film,
  music: Music,
  ticket: Ticket,
  scissors: Scissors,
  // Gia đình & bạn bè
  users: Users,
  baby: Baby,
  dog: Dog,
  gift: Gift,
  heart: Heart,
  // Tiền bạc
  wallet: Wallet,
  landmark: Landmark,
  'credit-card': CreditCard,
  'piggy-bank': PiggyBank,
  'trending-up': TrendingUp,
  briefcase: Briefcase,
  laptop: Laptop,
  target: Target,
  // Hệ thống
  scale: Scale,
  'circle-ellipsis': CircleEllipsis,
} as const;

export type CategoryIconName = keyof typeof CATEGORY_ICONS;

/**
 * Icon danh mục trong ô vuông bo tròn tô màu của chính danh mục đó.
 *
 * Tên icon không có trong bảng thì rơi về `circle-ellipsis` — dữ liệu cũ hoặc icon bị
 * gỡ khỏi lucide đều không được làm vỡ giao diện.
 */
export function CategoryIcon({
  icon,
  color,
  size = 'md',
  className,
}: {
  icon?: string | null;
  color?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[icon as CategoryIconName] ?? CircleEllipsis;

  const hop = { sm: 'size-7', md: 'size-9', lg: 'size-11' }[size];
  const co = { sm: 14, md: 17, lg: 21 }[size];

  return (
    <span
      className={`flex ${hop} shrink-0 items-center justify-center rounded-xl text-white ${className ?? ''}`}
      style={{ background: color ?? '#94a3b8' }}
    >
      <Icon size={co} />
    </span>
  );
}
