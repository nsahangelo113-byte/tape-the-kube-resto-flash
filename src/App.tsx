import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  LayoutDashboard,
  Store,
  UtensilsCrossed,
  ShoppingBag,
  QrCode,
  Image as ImageIcon,
  Settings,
  LogOut,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Pencil,
  Upload,
  Camera,
  Download,
  Printer,
  Check,
  X,
  ChevronRight,
  MoreHorizontal,
  Search,
  AlertCircle,
  Database,
  CheckCircle2,
  Banknote,
  ArrowRight,
  Copy,
  FileText,
  Volume2,
  VolumeX,
  MessageCircle,
  Phone,
} from 'lucide-react';

// ============================================================================
// TYPES & ARCHITECTURE (Prévu pour Supabase Auth + PostgreSQL RLS)
// ============================================================================

export type View =
  | 'login'
  | 'register'
  | 'setup'
  | 'dashboard'
  | 'restaurant'
  | 'menu'
  | 'orders'
  | 'qrcode'
  | 'visuals'
  | 'settings';

export type RestaurantType = 'Maquis' | 'Fast-food' | 'Pâtisserie' | 'Restaurant';

export type OrderStatus =
  | 'Nouvelle'
  | 'Confirmée'
  | 'En préparation'
  | 'Prête'
  | 'Terminée'
  | 'Annulée';

export type PaymentStatus = 'En attente' | 'Paiement reçu' | 'recu' | 'Remboursé';

export interface Profile {
  id: string;
  full_name: string;
  phone: string;
  email: string;
}

export interface AuthUserRecord {
  id: string;
  email: string;
  password_hash: string; // Mock localStorage uniquement; géré par Supabase Auth en prod
}

export interface Restaurant {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  logo_url: string;
  cover_url: string;
  description: string;
  type: RestaurantType;
  address: string;
  city: string;
  phone: string;
  whatsapp: string;
  menu_pdf_url?: string;
  menu_pdf_name?: string;
  created_at: string;
}

export interface Category {
  id: string;
  restaurant_id: string;
  name: string;
}

export interface Dish {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  photo_url: string;
  is_available: boolean;
  is_daily_special: boolean;
}

export interface OrderItem {
  id: string;
  order_id: string;
  dish_id: string;
  dish_name: string;
  quantity: number;
  unit_price: number;
}

export interface Order {
  id: string;
  restaurant_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  table_label: string;
  created_at: string;
  total: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method?: string;
  items: OrderItem[];
}

export interface Payment {
  id: string;
  order_id: string;
  restaurant_id: string;
  amount: number;
  status: PaymentStatus;
  method: string;
  confirmed_at?: string;
}

interface Session {
  user_id: string;
  email: string;
}

// ============================================================================
// CONSTANTES & CLÉS LOCALSTORAGE (Mock Supabase avec isolation par owner/resto)
// ============================================================================

const C = {
  orange: '#E87519',
  black: '#151515',
  white: '#FFFFFF',
  bg: '#151515',
  sidebar: '#0F0F0F',
  beige: '#FFFEF5',
  borderBeige: '#F2E8D9',
} as const;

const STORAGE_KEYS = {
  AUTH_USERS: 'rf_auth_users_v6',
  PROFILES: 'profiles',
  RESTAURANTS: 'restos_v6',
  CATEGORIES: 'rf_categories_v6',
  DISHES: 'rf_dishes_v6',
  ORDERS: 'rf_orders_v6',
  PAYMENTS: 'rf_payments_v6',
  SESSION: 'rf_session_v6',
} as const;

const ORDER_STATUSES: OrderStatus[] = [
  'Nouvelle',
  'Confirmée',
  'En préparation',
  'Prête',
  'Terminée',
  'Annulée',
];

const RESTAURANT_TYPES: RestaurantType[] = [
  'Maquis',
  'Fast-food',
  'Pâtisserie',
  'Restaurant',
];

const DEFAULT_CATEGORIES = [
  'Plats du jour',
  'Grillades',
  'Accompagnements',
  'Boissons',
  'Desserts',
];

// ============================================================================
// UTILITAIRES
// ============================================================================

const generateId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'mon-restaurant';

const formatFCFA = (amount: number): string =>
  `${Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;

const formatDateTime = (iso: string): string => {
  try {
    const d = new Date(iso);
    const today = new Date();
    const isSameDay =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
    const time = d.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    if (isSameDay) return `Aujourd'hui · ${time}`;
    return `${d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
    })} · ${time}`;
  } catch {
    return iso;
  }
};

const isTodayIso = (iso: string): boolean => {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
};

const formatDistanceToNow = (iso: string, nowMs: number = Date.now()): string => {
  try {
    const targetMs = new Date(iso).getTime();
    if (Number.isNaN(targetMs)) return iso;
    const diffSec = Math.max(0, Math.floor((nowMs - targetMs) / 1000));
    if (diffSec < 60) return "à l'instant";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `il y a ${diffMin} min`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `il y a ${diffHours} h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'hier';
    return `il y a ${diffDays} j`;
  } catch {
    return iso;
  }
};

const isPaymentReceived = (status: PaymentStatus): boolean =>
  status === 'recu' || status === 'Paiement reçu';

const formatOrderCode = (orderNumber: string): string => {
  const cleaned = orderNumber.replace(/^#RF-/i, '').replace(/^#Commande-/i, '').replace(/^#/, '');
  return `#Commande-${cleaned}`;
};

const buildWhatsAppOrderUrl = (order: Order): string => {
  const rawDigits = (order.customer_phone || '').replace(/\D/g, '');
  let waPhone = rawDigits;
  if (rawDigits.startsWith('0')) {
    waPhone = `2250${rawDigits.slice(1)}`;
  } else if (rawDigits.length > 0 && !rawDigits.startsWith('225')) {
    waPhone = `2250${rawDigits}`;
  }
  const msg = `Bonjour ${order.customer_name}, votre commande ${formatOrderCode(
    order.order_number
  )} (${formatFCFA(order.total)}) est actuellement : ${order.status}.`;
  return `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`;
};

const ORDER_STATUS_BADGE_STYLES: Record<OrderStatus, string> = {
  Nouvelle: 'bg-[#E87519] text-white',
  Confirmée: 'bg-blue-100 text-blue-800',
  'En préparation': 'bg-yellow-100 text-yellow-800',
  Prête: 'bg-green-100 text-green-800',
  Terminée: 'bg-gray-200 text-gray-800',
  Annulée: 'bg-red-100 text-red-800',
};

const playOrderBeep = (): void => {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.14, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch {
    // Audio context bloqué avant interaction utilisateur
  }
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('Erreur localStorage:', err);
  }
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Lecture image impossible'));
      }
    };
    reader.onerror = () => reject(new Error('Erreur lecture fichier'));
    reader.readAsDataURL(file);
  });

const getPublicBaseUrl = (): string => {
  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin;
  }
  return 'https://restoflash.app';
};

// Générateur PDF 1.4 dynamique sans dépendance externe (encodage WinAnsi pour accents FR)
const toWinAnsiPdfString = (input: string): string => {
  const normalized = input
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, '-')
    .replace(/•/g, '-')
    .replace(/×/g, 'x');
  let out = '';
  for (let i = 0; i < normalized.length; i += 1) {
    const code = normalized.charCodeAt(i);
    const safeChar =
      (code >= 32 && code <= 126) || (code >= 160 && code <= 255)
        ? normalized[i]
        : ' ';
    if (safeChar === '\\' || safeChar === '(' || safeChar === ')') {
      out += `\\${safeChar}`;
    } else {
      out += safeChar;
    }
  }
  return out;
};

const generateDynamicMenuPdfBlob = (
  restaurant: Restaurant,
  cats: Category[],
  dishList: Dish[]
): Blob => {
  const availableDishes = dishList.filter((d) => d.is_available);
  type PdfLine = {
    text: string;
    size: number;
    bold?: boolean;
    orange?: boolean;
    gapAfter: number;
  };
  const lines: PdfLine[] = [];

  lines.push({
    text: restaurant.name.toUpperCase(),
    size: 20,
    bold: true,
    gapAfter: 18,
  });
  lines.push({
    text: `${restaurant.type} - ${restaurant.city}${
      restaurant.address ? ` (${restaurant.address})` : ''
    }`,
    size: 10,
    gapAfter: 14,
  });
  if (restaurant.phone) {
    lines.push({
      text: `Tel : ${restaurant.phone}${
        restaurant.whatsapp ? `  |  WhatsApp : ${restaurant.whatsapp}` : ''
      }`,
      size: 10,
      gapAfter: 24,
    });
  }

  const grouped: { title: string; items: Dish[] }[] = cats
    .map((cat) => ({
      title: cat.name,
      items: availableDishes.filter((d) => d.category_id === cat.id),
    }))
    .filter((g) => g.items.length > 0);

  const uncategorized = availableDishes.filter(
    (d) => !cats.some((c) => c.id === d.category_id)
  );
  if (uncategorized.length > 0) {
    grouped.push({ title: 'Autres spécialités', items: uncategorized });
  }

  if (grouped.length === 0) {
    lines.push({
      text: 'Aucun plat disponible pour le moment.',
      size: 11,
      gapAfter: 16,
    });
  } else {
    grouped.forEach((group) => {
      lines.push({
        text: group.title.toUpperCase(),
        size: 12,
        bold: true,
        orange: true,
        gapAfter: 16,
      });
      group.items.forEach((dish) => {
        const special = dish.is_daily_special ? ' [Plat du jour]' : '';
        lines.push({
          text: `${dish.name}${special}   -   ${formatFCFA(dish.price)}`,
          size: 11,
          bold: true,
          gapAfter: dish.description ? 13 : 16,
        });
        if (dish.description) {
          const desc =
            dish.description.length > 82
              ? `${dish.description.slice(0, 79)}...`
              : dish.description;
          lines.push({
            text: desc,
            size: 9,
            gapAfter: 15,
          });
        }
      });
      lines.push({ text: '', size: 8, gapAfter: 10 });
    });
  }

  // Découpage en pages A4 (595 x 842 pt)
  const pageStreams: string[] = [];
  let currentCmds: string[] = [];
  let y = 785;

  const flushPage = () => {
    currentCmds.push(
      `BT /F1 8 Tf 0.45 0.45 0.45 rg 50 32 Td (RESTO FLASH - Carte generee le ${toWinAnsiPdfString(
        new Date().toLocaleDateString('fr-FR')
      )}) Tj ET`
    );
    pageStreams.push(currentCmds.join('\n'));
    currentCmds = [];
    y = 785;
  };

  lines.forEach((line) => {
    if (y < 70) {
      flushPage();
    }
    if (line.text) {
      const font = line.bold ? '/F2' : '/F1';
      const color = line.orange ? '0.91 0.46 0.10 rg' : '0.08 0.08 0.08 rg';
      currentCmds.push(
        `BT ${font} ${line.size} Tf ${color} 50 ${y} Td (${toWinAnsiPdfString(
          line.text
        )}) Tj ET`
      );
    }
    y -= line.gapAfter;
  });

  if (currentCmds.length > 0 || pageStreams.length === 0) {
    flushPage();
  }

  // Construction objets PDF 1.4
  const objects: string[] = [];
  const pageCount = pageStreams.length;
  // Obj 1: Catalog, Obj 2: Pages, Obj 3: Font Regular, Obj 4: Font Bold
  const pageObjNums: number[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    pageObjNums.push(5 + i * 2);
  }

  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums
      .map((n) => `${n} 0 R`)
      .join(' ')}] /Count ${pageCount} >>\nendobj\n`
  );
  objects.push(
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n'
  );
  objects.push(
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n'
  );

  pageStreams.forEach((stream, idx) => {
    const pageNum = 5 + idx * 2;
    const contentNum = pageNum + 1;
    objects.push(
      `${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNum} 0 R >>\nendobj\n`
    );
    objects.push(
      `${contentNum} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`
    );
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach((obj) => {
    offsets.push(pdf.length);
    pdf += obj;
  });

  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i += 1) {
    bytes[i] = pdf.charCodeAt(i) & 0xff;
  }
  return new Blob([bytes], { type: 'application/pdf' });
};

// ============================================================================
// DONNÉES DÉMO INITIALES (Pour découvrir immédiatement l'espace restaurateur)
// ============================================================================

const DEMO_OWNER_ID = 'usr_demo_chef_awa';
const DEMO_RESTO_ID = 'rst_demo_chez_awa';

function ensureDemoSeed(): void {
  const users = readStorage<AuthUserRecord[]>(STORAGE_KEYS.AUTH_USERS, []);
  if (users.some((u) => u.id === DEMO_OWNER_ID)) return;

  const profiles = readStorage<Profile[]>(STORAGE_KEYS.PROFILES, []);
  const restaurants = readStorage<Restaurant[]>(STORAGE_KEYS.RESTAURANTS, []);
  const categories = readStorage<Category[]>(STORAGE_KEYS.CATEGORIES, []);
  const dishes = readStorage<Dish[]>(STORAGE_KEYS.DISHES, []);
  const orders = readStorage<Order[]>(STORAGE_KEYS.ORDERS, []);
  const payments = readStorage<Payment[]>(STORAGE_KEYS.PAYMENTS, []);

  const now = new Date();
  const hoursAgo = (h: number, m = 0): string => {
    const d = new Date(now);
    d.setHours(Math.max(8, now.getHours() - h), m, 0, 0);
    return d.toISOString();
  };

  const demoUser: AuthUserRecord = {
    id: DEMO_OWNER_ID,
    email: 'chef@cheztantieawa.ci',
    password_hash: 'demo1234',
  };

  const demoProfile: Profile = {
    id: DEMO_OWNER_ID,
    full_name: 'Awa Koné',
    phone: '+225 07 48 12 90 11',
    email: 'chef@cheztantieawa.ci',
  };

  const demoResto: Restaurant = {
    id: DEMO_RESTO_ID,
    owner_id: DEMO_OWNER_ID,
    name: 'Chez Tantie Awa',
    slug: 'chez-tantie-awa',
    logo_url: '',
    cover_url: '',
    description:
      'Cuisine ivoirienne authentique au feu de bois, poissons braisés et attiéké frais préparés chaque matin.',
    type: 'Maquis',
    address: 'Rue des Jardins, 2 Plateaux',
    city: 'Abidjan',
    phone: '+225 07 48 12 90 11',
    whatsapp: '+225 07 48 12 90 11',
    created_at: hoursAgo(240),
  };

  const demoCategories: Category[] = [
    { id: 'cat_demo_1', restaurant_id: DEMO_RESTO_ID, name: 'Grillades' },
    { id: 'cat_demo_2', restaurant_id: DEMO_RESTO_ID, name: 'Plats en sauce' },
    { id: 'cat_demo_3', restaurant_id: DEMO_RESTO_ID, name: 'Accompagnements' },
    { id: 'cat_demo_4', restaurant_id: DEMO_RESTO_ID, name: 'Boissons' },
    { id: 'cat_demo_5', restaurant_id: DEMO_RESTO_ID, name: 'Desserts' },
  ];

  // 18 plats disponibles + 1 épuisé = 19 plats au total, 18 disponibles
  const demoDishes: Dish[] = [
    {
      id: 'dsh_demo_01',
      restaurant_id: DEMO_RESTO_ID,
      category_id: 'cat_demo_1',
      name: 'Carpe braisée complète',
      description: 'Carpe fraîche marinée aux épices locales, servie avec piment vert et oignons.',
      price: 6500,
      photo_url: '',
      is_available: true,
      is_daily_special: true,
    },
    {
      id: 'dsh_demo_02',
      restaurant_id: DEMO_RESTO_ID,
      category_id: 'cat_demo_1',
      name: 'Poulet piqué braisé (1/2)',
      description: 'Poulet fermier grillé au charbon, sauce moutarde maison.',
      price: 4500,
      photo_url: '',
      is_available: true,
      is_daily_special: true,
    },
    {
      id: 'dsh_demo_03',
      restaurant_id: DEMO_RESTO_ID,
      category_id: 'cat_demo_1',
      name: 'Brochettes de bœuf soyées',
      description: 'Tendre filet de bœuf mariné au kankankan.',
      price: 3000,
      photo_url: '',
      is_available: true,
      is_daily_special: false,
    },
    {
      id: 'dsh_demo_04',
      restaurant_id: DEMO_RESTO_ID,
      category_id: 'cat_demo_1',
      name: 'Choukouya de mouton',
      description: 'Épaule de mouton grillée et émincée aux oignons doux.',
      price: 5500,
      photo_url: '',
      is_available: true,
      is_daily_special: false,
    },
    {
      id: 'dsh_demo_05',
      restaurant_id: DEMO_RESTO_ID,
      category_id: 'cat_demo_2',
      name: 'Garba royal thon frais',
      description: 'Attiéké chaud, darne de thon frit, piment frais et tomates.',
      price: 3500,
      photo_url: '',
      is_available: true,
      is_daily_special: true,
    },
    {
      id: 'dsh_demo_06',
      restaurant_id: DEMO_RESTO_ID,
      category_id: 'cat_demo_2',
      name: 'Sauce graine & foutou banane',
      description: 'Sauce graine mijotée avec viande de brousse et crabe.',
      price: 5000,
      photo_url: '',
      is_available: true,
      is_daily_special: false,
    },
    {
      id: 'dsh_demo_07',
      restaurant_id: DEMO_RESTO_ID,
      category_id: 'cat_demo_2',
      name: 'Kedjenou de pintade',
      description: 'Mijoté à l’étouffée en canari avec aubergines et gingembre.',
      price: 6000,
      photo_url: '',
      is_available: true,
      is_daily_special: false,
    },
    {
      id: 'dsh_demo_08',
      restaurant_id: DEMO_RESTO_ID,
      category_id: 'cat_demo_2',
      name: 'Placali sauce gombo',
      description: 'Placali onctueux servi avec sauce gombo frais et poisson fumé.',
      price: 4000,
      photo_url: '',
      is_available: true,
      is_daily_special: false,
    },
    {
      id: 'dsh_demo_09',
      restaurant_id: DEMO_RESTO_ID,
      category_id: 'cat_demo_2',
      name: 'Tchep au poisson thiof',
      description: 'Riz parfumé cuit dans un bouillon de légumes et poisson thiof.',
      price: 4500,
      photo_url: '',
      is_available: true,
      is_daily_special: false,
    },
    {
      id: 'dsh_demo_10',
      restaurant_id: DEMO_RESTO_ID,
      category_id: 'cat_demo_3',
      name: 'Alloco croustillant',
      description: 'Bananes plantains mûres frites dorées.',
      price: 1500,
      photo_url: '',
      is_available: true,
      is_daily_special: false,
    },
    {
      id: 'dsh_demo_11',
      restaurant_id: DEMO_RESTO_ID,
      category_id: 'cat_demo_3',
      name: 'Portion Attiéké supérieur',
      description: 'Semoule de manioc cuite à la vapeur.',
      price: 1000,
      photo_url: '',
      is_available: true,
      is_daily_special: false,
    },
    {
      id: 'dsh_demo_12',
      restaurant_id: DEMO_RESTO_ID,
      category_id: 'cat_demo_3',
      name: 'Igname frite',
      description: 'Bâtonnets d’igname dorés et légèrement salés.',
      price: 1500,
      photo_url: '',
      is_available: true,
      is_daily_special: false,
    },
    {
      id: 'dsh_demo_13',
      restaurant_id: DEMO_RESTO_ID,
      category_id: 'cat_demo_3',
      name: 'Riz blanc parfumé',
      description: 'Portion individuelle de riz jasmin.',
      price: 1000,
      photo_url: '',
      is_available: true,
      is_daily_special: false,
    },
    {
      id: 'dsh_demo_14',
      restaurant_id: DEMO_RESTO_ID,
      category_id: 'cat_demo_4',
      name: 'Bissap glacé maison',
      description: 'Infusion de fleurs d’hibiscus à la menthe fraîche (50cl).',
      price: 1000,
      photo_url: '',
      is_available: true,
      is_daily_special: false,
    },
    {
      id: 'dsh_demo_15',
      restaurant_id: DEMO_RESTO_ID,
      category_id: 'cat_demo_4',
      name: 'Gnamakoudji citronné',
      description: 'Jus de gingembre pressé et ananas (50cl).',
      price: 1000,
      photo_url: '',
      is_available: true,
      is_daily_special: false,
    },
    {
      id: 'dsh_demo_16',
      restaurant_id: DEMO_RESTO_ID,
      category_id: 'cat_demo_4',
      name: 'Eau minérale fraîche (1,5L)',
      description: 'Bouteille d’eau minérale bien fraîche.',
      price: 1000,
      photo_url: '',
      is_available: true,
      is_daily_special: false,
    },
    {
      id: 'dsh_demo_17',
      restaurant_id: DEMO_RESTO_ID,
      category_id: 'cat_demo_4',
      name: 'Jus de bouye (baobab)',
      description: 'Nectar de fruit de baobab velouté.',
      price: 1500,
      photo_url: '',
      is_available: true,
      is_daily_special: false,
    },
    {
      id: 'dsh_demo_18',
      restaurant_id: DEMO_RESTO_ID,
      category_id: 'cat_demo_5',
      name: 'Dégué au yaourt vanillé',
      description: 'Couscous de mil fin au lait caillé sucré et muscade.',
      price: 1500,
      photo_url: '',
      is_available: true,
      is_daily_special: false,
    },
    {
      id: 'dsh_demo_19',
      restaurant_id: DEMO_RESTO_ID,
      category_id: 'cat_demo_5',
      name: 'Salade de mangue & ananas',
      description: 'Fruits frais de saison coupés minute.',
      price: 2000,
      photo_url: '',
      is_available: false,
      is_daily_special: false,
    },
  ];

  // 12 commandes du jour : 3 en attente, 8 terminées, 1 annulée -> CA = 84 500 F
  const demoOrders: Order[] = [
    {
      id: 'ord_demo_1023',
      restaurant_id: DEMO_RESTO_ID,
      order_number: '#RF-1023',
      customer_name: 'Kouassi Marc',
      customer_phone: '+225 05 64 21 09 32',
      table_label: 'Table 4',
      created_at: hoursAgo(0, 18),
      total: 9500,
      status: 'Nouvelle',
      payment_status: 'En attente',
      items: [
        {
          id: 'oi_1',
          order_id: 'ord_demo_1023',
          dish_id: 'dsh_demo_01',
          dish_name: 'Carpe braisée complète',
          quantity: 1,
          unit_price: 6500,
        },
        {
          id: 'oi_2',
          order_id: 'ord_demo_1023',
          dish_id: 'dsh_demo_10',
          dish_name: 'Alloco croustillant',
          quantity: 1,
          unit_price: 1500,
        },
        {
          id: 'oi_3',
          order_id: 'ord_demo_1023',
          dish_id: 'dsh_demo_17',
          dish_name: 'Jus de bouye (baobab)',
          quantity: 1,
          unit_price: 1500,
        },
      ],
    },
    {
      id: 'ord_demo_1022',
      restaurant_id: DEMO_RESTO_ID,
      order_number: '#RF-1022',
      customer_name: 'Fatou Bamba',
      customer_phone: '+225 07 88 12 45 00',
      table_label: 'À emporter',
      created_at: hoursAgo(0, 35),
      total: 7000,
      status: 'Confirmée',
      payment_status: 'En attente',
      items: [
        {
          id: 'oi_4',
          order_id: 'ord_demo_1022',
          dish_id: 'dsh_demo_02',
          dish_name: 'Poulet piqué braisé (1/2)',
          quantity: 1,
          unit_price: 4500,
        },
        {
          id: 'oi_5',
          order_id: 'ord_demo_1022',
          dish_id: 'dsh_demo_11',
          dish_name: 'Portion Attiéké supérieur',
          quantity: 1,
          unit_price: 1000,
        },
        {
          id: 'oi_6',
          order_id: 'ord_demo_1022',
          dish_id: 'dsh_demo_18',
          dish_name: 'Dégué au yaourt vanillé',
          quantity: 1,
          unit_price: 1500,
        },
      ],
    },
    {
      id: 'ord_demo_1021',
      restaurant_id: DEMO_RESTO_ID,
      order_number: '#RF-1021',
      customer_name: 'Yao Stéphane',
      customer_phone: '+225 01 42 78 33 10',
      table_label: 'Table 2',
      created_at: hoursAgo(1, 10),
      total: 12000,
      status: 'En préparation',
      payment_status: 'Paiement reçu',
      items: [
        {
          id: 'oi_7',
          order_id: 'ord_demo_1021',
          dish_id: 'dsh_demo_04',
          dish_name: 'Choukouya de mouton',
          quantity: 2,
          unit_price: 5500,
        },
        {
          id: 'oi_8',
          order_id: 'ord_demo_1021',
          dish_id: 'dsh_demo_15',
          dish_name: 'Gnamakoudji citronné',
          quantity: 1,
          unit_price: 1000,
        },
      ],
    },
    {
      id: 'ord_demo_1020',
      restaurant_id: DEMO_RESTO_ID,
      order_number: '#RF-1020',
      customer_name: 'Aminata Diallo',
      customer_phone: '+225 07 11 90 44 21',
      table_label: 'Table 7',
      created_at: hoursAgo(1, 45),
      total: 8500,
      status: 'Terminée',
      payment_status: 'Paiement reçu',
      items: [
        {
          id: 'oi_9',
          order_id: 'ord_demo_1020',
          dish_id: 'dsh_demo_01',
          dish_name: 'Carpe braisée complète',
          quantity: 1,
          unit_price: 6500,
        },
        {
          id: 'oi_10',
          order_id: 'ord_demo_1020',
          dish_id: 'dsh_demo_11',
          dish_name: 'Portion Attiéké supérieur',
          quantity: 2,
          unit_price: 1000,
        },
      ],
    },
    {
      id: 'ord_demo_1019',
      restaurant_id: DEMO_RESTO_ID,
      order_number: '#RF-1019',
      customer_name: 'Cédric N’Guessan',
      customer_phone: '+225 05 90 12 34 56',
      table_label: 'Table 1',
      created_at: hoursAgo(2, 5),
      total: 6500,
      status: 'Terminée',
      payment_status: 'Paiement reçu',
      items: [
        {
          id: 'oi_11',
          order_id: 'ord_demo_1019',
          dish_id: 'dsh_demo_06',
          dish_name: 'Sauce graine & foutou banane',
          quantity: 1,
          unit_price: 5000,
        },
        {
          id: 'oi_12',
          order_id: 'ord_demo_1019',
          dish_id: 'dsh_demo_17',
          dish_name: 'Jus de bouye (baobab)',
          quantity: 1,
          unit_price: 1500,
        },
      ],
    },
    {
      id: 'ord_demo_1018',
      restaurant_id: DEMO_RESTO_ID,
      order_number: '#RF-1018',
      customer_name: 'Mariam Touré',
      customer_phone: '+225 07 55 43 21 89',
      table_label: 'Table 5',
      created_at: hoursAgo(2, 40),
      total: 11000,
      status: 'Terminée',
      payment_status: 'Paiement reçu',
      items: [
        {
          id: 'oi_13',
          order_id: 'ord_demo_1018',
          dish_id: 'dsh_demo_07',
          dish_name: 'Kedjenou de pintade',
          quantity: 1,
          unit_price: 6000,
        },
        {
          id: 'oi_14',
          order_id: 'ord_demo_1018',
          dish_id: 'dsh_demo_06',
          dish_name: 'Sauce graine & foutou banane',
          quantity: 1,
          unit_price: 5000,
        },
      ],
    },
    {
      id: 'ord_demo_1017',
      restaurant_id: DEMO_RESTO_ID,
      order_number: '#RF-1017',
      customer_name: 'Jean-Luc Brou',
      customer_phone: '+225 01 23 45 67 89',
      table_label: 'À emporter',
      created_at: hoursAgo(3, 12),
      total: 5500,
      status: 'Terminée',
      payment_status: 'Paiement reçu',
      items: [
        {
          id: 'oi_16',
          order_id: 'ord_demo_1017',
          dish_id: 'dsh_demo_05',
          dish_name: 'Garba royal thon frais',
          quantity: 1,
          unit_price: 3500,
        },
        {
          id: 'oi_17',
          order_id: 'ord_demo_1017',
          dish_id: 'dsh_demo_14',
          dish_name: 'Bissap glacé maison',
          quantity: 2,
          unit_price: 1000,
        },
      ],
    },
    {
      id: 'ord_demo_1016',
      restaurant_id: DEMO_RESTO_ID,
      order_number: '#RF-1016',
      customer_name: 'Salimata Ouattara',
      customer_phone: '+225 07 62 31 44 09',
      table_label: 'Table 3',
      created_at: hoursAgo(3, 50),
      total: 7500,
      status: 'Terminée',
      payment_status: 'Paiement reçu',
      items: [
        {
          id: 'oi_18',
          order_id: 'ord_demo_1016',
          dish_id: 'dsh_demo_02',
          dish_name: 'Poulet piqué braisé (1/2)',
          quantity: 1,
          unit_price: 4500,
        },
        {
          id: 'oi_19',
          order_id: 'ord_demo_1016',
          dish_id: 'dsh_demo_03',
          dish_name: 'Brochettes de bœuf soyées',
          quantity: 1,
          unit_price: 3000,
        },
      ],
    },
    {
      id: 'ord_demo_1015',
      restaurant_id: DEMO_RESTO_ID,
      order_number: '#RF-1015',
      customer_name: 'Ibrahim Cissé',
      customer_phone: '+225 05 33 19 82 40',
      table_label: 'À emporter',
      created_at: hoursAgo(4, 15),
      total: 4500,
      status: 'Terminée',
      payment_status: 'Paiement reçu',
      items: [
        {
          id: 'oi_20',
          order_id: 'ord_demo_1015',
          dish_id: 'dsh_demo_09',
          dish_name: 'Tchep au poisson thiof',
          quantity: 1,
          unit_price: 4500,
        },
      ],
    },
    {
      id: 'ord_demo_1014',
      restaurant_id: DEMO_RESTO_ID,
      order_number: '#RF-1014',
      customer_name: 'Nadine Koffi',
      customer_phone: '+225 07 49 01 22 76',
      table_label: 'Table 6',
      created_at: hoursAgo(4, 48),
      total: 6000,
      status: 'Terminée',
      payment_status: 'Paiement reçu',
      items: [
        {
          id: 'oi_21',
          order_id: 'ord_demo_1014',
          dish_id: 'dsh_demo_08',
          dish_name: 'Placali sauce gombo',
          quantity: 1,
          unit_price: 4000,
        },
        {
          id: 'oi_22',
          order_id: 'ord_demo_1014',
          dish_id: 'dsh_demo_14',
          dish_name: 'Bissap glacé maison',
          quantity: 2,
          unit_price: 1000,
        },
      ],
    },
    {
      id: 'ord_demo_1013',
      restaurant_id: DEMO_RESTO_ID,
      order_number: '#RF-1013',
      customer_name: 'Éric Zadi',
      customer_phone: '+225 01 77 88 99 12',
      table_label: 'Table 8',
      created_at: hoursAgo(5, 20),
      total: 6500,
      status: 'Terminée',
      payment_status: 'Paiement reçu',
      items: [
        {
          id: 'oi_23',
          order_id: 'ord_demo_1013',
          dish_id: 'dsh_demo_01',
          dish_name: 'Carpe braisée complète',
          quantity: 1,
          unit_price: 6500,
        },
      ],
    },
    {
      id: 'ord_demo_1012',
      restaurant_id: DEMO_RESTO_ID,
      order_number: '#RF-1012',
      customer_name: 'Pauline Soro',
      customer_phone: '+225 05 12 34 98 76',
      table_label: 'Table 2',
      created_at: hoursAgo(5, 55),
      total: 4000,
      status: 'Annulée',
      payment_status: 'Remboursé',
      items: [
        {
          id: 'oi_24',
          order_id: 'ord_demo_1012',
          dish_id: 'dsh_demo_08',
          dish_name: 'Placali sauce gombo',
          quantity: 1,
          unit_price: 4000,
        },
      ],
    },
  ];

  const demoPayments: Payment[] = demoOrders.map((o) => ({
    id: `pay_${o.id}`,
    order_id: o.id,
    restaurant_id: DEMO_RESTO_ID,
    amount: o.total,
    status: o.payment_status,
    method: 'Manuel (Espèces / Mobile Money)',
    confirmed_at:
      o.payment_status === 'Paiement reçu' ? o.created_at : undefined,
  }));

  writeStorage(STORAGE_KEYS.AUTH_USERS, [...users, demoUser]);
  writeStorage(STORAGE_KEYS.PROFILES, [...profiles, demoProfile]);
  writeStorage(STORAGE_KEYS.RESTAURANTS, [...restaurants, demoResto]);
  writeStorage(STORAGE_KEYS.CATEGORIES, [...categories, ...demoCategories]);
  writeStorage(STORAGE_KEYS.DISHES, [...dishes, ...demoDishes]);
  writeStorage(STORAGE_KEYS.ORDERS, [...orders, ...demoOrders]);
  writeStorage(STORAGE_KEYS.PAYMENTS, [...payments, ...demoPayments]);
}

// ============================================================================
// COMPOSANT PRINCIPAL RESTO FLASH BACK-OFFICE
// ============================================================================

export default function App() {
  // Initialisation seed démo au chargement
  useEffect(() => {
    ensureDemoSeed();
  }, []);

  // ---------- ÉTATS GLOBAUX (Isolés par session / owner_id / restaurant_id) ----------
  const [session, setSession] = useState<Session | null>(() =>
    readStorage<Session | null>(STORAGE_KEYS.SESSION, null)
  );
  const [profiles, setProfiles] = useState<Profile[]>(() =>
    readStorage<Profile[]>(STORAGE_KEYS.PROFILES, [])
  );
  const [restaurants, setRestaurants] = useState<Restaurant[]>(() =>
    readStorage<Restaurant[]>(STORAGE_KEYS.RESTAURANTS, [])
  );
  const [categories, setCategories] = useState<Category[]>(() =>
    readStorage<Category[]>(STORAGE_KEYS.CATEGORIES, [])
  );
  const [dishes, setDishes] = useState<Dish[]>(() =>
    readStorage<Dish[]>(STORAGE_KEYS.DISHES, [])
  );
  const [orders, setOrders] = useState<Order[]>(() =>
    readStorage<Order[]>(STORAGE_KEYS.ORDERS, [])
  );
  const [payments, setPayments] = useState<Payment[]>(() =>
    readStorage<Payment[]>(STORAGE_KEYS.PAYMENTS, [])
  );

  // Profil & restaurant courants (Simulation RLS : owner_id = auth.uid())
  const currentProfile = useMemo(
    () =>
      session ? profiles.find((p) => p.id === session.user_id) ?? null : null,
    [session, profiles]
  );

  const currentRestaurant = useMemo(
    () =>
      session
        ? restaurants.find((r) => r.owner_id === session.user_id) ?? null
        : null,
    [session, restaurants]
  );

  // Données strictement filtrées par restaurant_id (zéro mélange inter-restaurants)
  const myCategories = useMemo(
    () =>
      currentRestaurant
        ? categories.filter((c) => c.restaurant_id === currentRestaurant.id)
        : [],
    [categories, currentRestaurant]
  );

  const myDishes = useMemo(
    () =>
      currentRestaurant
        ? dishes.filter((d) => d.restaurant_id === currentRestaurant.id)
        : [],
    [dishes, currentRestaurant]
  );

  const myOrders = useMemo(
    () =>
      currentRestaurant
        ? orders
            .filter((o) => o.restaurant_id === currentRestaurant.id)
            .sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            )
        : [],
    [orders, currentRestaurant]
  );

  // ---------- NAVIGATION HISTORY.PUSHSTATE ----------
  const resolveInitialView = (): View => {
    const validViews: View[] = [
      'login',
      'register',
      'setup',
      'dashboard',
      'restaurant',
      'menu',
      'orders',
      'qrcode',
      'visuals',
      'settings',
    ];
    const pathView = window.location.pathname.replace(/^\/+/, '').split('/')[0] as View;
    const savedSession = readStorage<Session | null>(STORAGE_KEYS.SESSION, null);
    const savedRestos = readStorage<Restaurant[]>(STORAGE_KEYS.RESTAURANTS, []);
    const hasResto = savedSession
      ? savedRestos.some((r) => r.owner_id === savedSession.user_id)
      : false;

    if (!savedSession) {
      return pathView === 'register' ? 'register' : 'login';
    }
    if (!hasResto) {
      return 'setup';
    }
    if (validViews.includes(pathView) && pathView !== 'login' && pathView !== 'register' && pathView !== 'setup') {
      return pathView;
    }
    return 'dashboard';
  };

  const [view, setView] = useState<View>(resolveInitialView);

  const navigate = (nextView: View, replace = false) => {
    setView(nextView);
    const targetPath = `/${nextView}`;
    try {
      if (replace) {
        window.history.replaceState({ view: nextView }, '', targetPath);
      } else {
        window.history.pushState({ view: nextView }, '', targetPath);
      }
    } catch {
      // Sécurité si contexte iframe restreint
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const stateView = event.state?.view as View | undefined;
      if (stateView) {
        setView(stateView);
        return;
      }
      setView(resolveInitialView());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Garde d'authentification réactive
  useEffect(() => {
    if (!session && view !== 'login' && view !== 'register') {
      navigate('login', true);
    } else if (session && !currentRestaurant && view !== 'setup') {
      navigate('setup', true);
    }
  }, [session, currentRestaurant, view]);

  // ---------- TOAST DISCRET ----------
  const [toast, setToast] = useState<{
    message: string;
    tone: 'success' | 'error' | 'info';
  } | null>(null);

  const notify = (
    message: string,
    tone: 'success' | 'error' | 'info' = 'success'
  ) => {
    setToast({ message, tone });
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // ---------- ÉTATS AUTH (LOGIN / REGISTER) ----------
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [showForgotNotice, setShowForgotNotice] = useState(false);

  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  // ---------- ÉTAT MOBILE DRAWER ("Plus") ----------
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  // ---------- HANDLERS AUTH ----------
  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const trimmedName = regFullName.trim();
    const trimmedEmail = regEmail.trim().toLowerCase();
    const trimmedPhone = regPhone.trim();

    if (!trimmedName || !trimmedEmail || !trimmedPhone || !regPassword) {
      setAuthError('Veuillez remplir tous les champs obligatoires.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setAuthError('Adresse email invalide.');
      return;
    }
    if (regPassword.length < 6) {
      setAuthError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (regPassword !== regConfirm) {
      setAuthError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    // TODO SUPABASE :
    // const { data, error } = await supabase.auth.signUp({
    //   email: trimmedEmail,
    //   password: regPassword,
    //   options: { data: { full_name: trimmedName, phone: trimmedPhone } }
    // });
    const existingUsers = readStorage<AuthUserRecord[]>(
      STORAGE_KEYS.AUTH_USERS,
      []
    );
    if (existingUsers.some((u) => u.email.toLowerCase() === trimmedEmail)) {
      setAuthError('Un compte existe déjà avec cet email.');
      return;
    }

    const userId = generateId('usr');
    const newUser: AuthUserRecord = {
      id: userId,
      email: trimmedEmail,
      password_hash: regPassword,
    };
    const newProfile: Profile = {
      id: userId,
      full_name: trimmedName,
      phone: trimmedPhone,
      email: trimmedEmail,
    };

    writeStorage(STORAGE_KEYS.AUTH_USERS, [...existingUsers, newUser]);
    const nextProfiles = [...profiles, newProfile];
    setProfiles(nextProfiles);
    writeStorage(STORAGE_KEYS.PROFILES, nextProfiles);

    const newSession: Session = { user_id: userId, email: trimmedEmail };
    setSession(newSession);
    writeStorage(STORAGE_KEYS.SESSION, newSession);

    setRegFullName('');
    setRegEmail('');
    setRegPhone('');
    setRegPassword('');
    setRegConfirm('');

    notify('Compte créé. Configurez maintenant votre restaurant.');
    navigate('setup');
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const trimmedEmail = loginEmail.trim().toLowerCase();
    if (!trimmedEmail || !loginPassword) {
      setAuthError('Veuillez saisir votre email et votre mot de passe.');
      return;
    }

    // TODO SUPABASE :
    // const { data, error } = await supabase.auth.signInWithPassword({
    //   email: trimmedEmail,
    //   password: loginPassword,
    // });
    const users = readStorage<AuthUserRecord[]>(STORAGE_KEYS.AUTH_USERS, []);
    const matched = users.find(
      (u) =>
        u.email.toLowerCase() === trimmedEmail &&
        u.password_hash === loginPassword
    );

    if (!matched) {
      setAuthError('Email ou mot de passe incorrect.');
      return;
    }

    const newSession: Session = { user_id: matched.id, email: matched.email };
    setSession(newSession);
    writeStorage(STORAGE_KEYS.SESSION, newSession);

    const hasResto = restaurants.some((r) => r.owner_id === matched.id);
    notify('Connexion réussie.');
    navigate(hasResto ? 'dashboard' : 'setup');
  };

  const handleDemoLogin = () => {
    ensureDemoSeed();
    setProfiles(readStorage<Profile[]>(STORAGE_KEYS.PROFILES, []));
    setRestaurants(readStorage<Restaurant[]>(STORAGE_KEYS.RESTAURANTS, []));
    setCategories(readStorage<Category[]>(STORAGE_KEYS.CATEGORIES, []));
    setDishes(readStorage<Dish[]>(STORAGE_KEYS.DISHES, []));
    setOrders(readStorage<Order[]>(STORAGE_KEYS.ORDERS, []));
    setPayments(readStorage<Payment[]>(STORAGE_KEYS.PAYMENTS, []));

    const demoSession: Session = {
      user_id: DEMO_OWNER_ID,
      email: 'chef@cheztantieawa.ci',
    };
    setSession(demoSession);
    writeStorage(STORAGE_KEYS.SESSION, demoSession);
    notify('Connecté au restaurant démo Chez Tantie Awa.');
    navigate('dashboard');
  };

  const handleLogout = () => {
    // TODO SUPABASE : await supabase.auth.signOut();
    setSession(null);
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    setMobileMoreOpen(false);
    setLoginPassword('');
    setAuthError('');
    notify('Vous êtes déconnecté.', 'info');
    navigate('login');
  };

  // ---------- ÉTATS CONFIGURATION / ÉDITION RESTAURANT ----------
  const [restoForm, setRestoForm] = useState<{
    name: string;
    logo_url: string;
    cover_url: string;
    description: string;
    type: RestaurantType;
    address: string;
    city: string;
    phone: string;
    whatsapp: string;
    menu_pdf_url: string;
    menu_pdf_name: string;
  }>({
    name: '',
    logo_url: '',
    cover_url: '',
    description: '',
    type: 'Restaurant',
    address: '',
    city: '',
    phone: '',
    whatsapp: '',
    menu_pdf_url: '',
    menu_pdf_name: '',
  });

  useEffect(() => {
    if (currentRestaurant) {
      setRestoForm({
        name: currentRestaurant.name,
        logo_url: currentRestaurant.logo_url,
        cover_url: currentRestaurant.cover_url,
        description: currentRestaurant.description,
        type: currentRestaurant.type,
        address: currentRestaurant.address,
        city: currentRestaurant.city,
        phone: currentRestaurant.phone,
        whatsapp: currentRestaurant.whatsapp,
        menu_pdf_url: currentRestaurant.menu_pdf_url || '',
        menu_pdf_name: currentRestaurant.menu_pdf_name || '',
      });
    } else if (view === 'setup') {
      setRestoForm({
        name: '',
        logo_url: '',
        cover_url: '',
        description: '',
        type: 'Restaurant',
        address: '',
        city: '',
        phone: currentProfile?.phone || '',
        whatsapp: currentProfile?.phone || '',
        menu_pdf_url: '',
        menu_pdf_name: '',
      });
    }
  }, [currentRestaurant, view, currentProfile]);

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfChoiceModalOpen, setPdfChoiceModalOpen] = useState(false);

  const handleRestaurantImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'logo_url' | 'cover_url'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await fileToBase64(file);
      setRestoForm((prev) => ({ ...prev, [field]: base64 }));
    } catch {
      notify("Impossible de charger l'image.", 'error');
    }
  };

  const handleMenuPdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      notify('Veuillez choisir un fichier au format PDF (.pdf).', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      notify('Le fichier PDF ne doit pas dépasser 10 Mo.', 'error');
      return;
    }

    // TODO SUPABASE :
    // await supabase.storage.from('restaurant-assets').upload(`${user.id}/menu-${Date.now()}.pdf`, file)
    // const { data } = supabase.storage.from('restaurant-assets').getPublicUrl(path)
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = typeof reader.result === 'string' ? reader.result : '';
      if (!base64) return;
      setRestoForm((prev) => ({
        ...prev,
        menu_pdf_url: base64,
        menu_pdf_name: file.name,
      }));
      notify(`PDF « ${file.name} » chargé. Cliquez sur Enregistrer.`);
    };
    reader.onerror = () => {
      notify('Erreur lors de la lecture du fichier PDF.', 'error');
    };
    e.target.value = '';
  };

  const handleSaveMenuPdf = () => {
    if (!currentRestaurant) return;
    // TODO SUPABASE :
    // await supabase.from('restaurants').update({ menu_pdf_url: restoForm.menu_pdf_url, menu_pdf_name: restoForm.menu_pdf_name }).eq('id', currentRestaurant.id)
    const updated: Restaurant = {
      ...currentRestaurant,
      menu_pdf_url: restoForm.menu_pdf_url || undefined,
      menu_pdf_name: restoForm.menu_pdf_name || undefined,
    };
    const next = restaurants.map((r) =>
      r.id === currentRestaurant.id ? updated : r
    );
    setRestaurants(next);
    writeStorage(STORAGE_KEYS.RESTAURANTS, next);
    notify('Carte PDF enregistrée.');
  };

  const handleDeleteMenuPdf = () => {
    setRestoForm((prev) => ({
      ...prev,
      menu_pdf_url: '',
      menu_pdf_name: '',
    }));
    if (currentRestaurant) {
      const updated: Restaurant = {
        ...currentRestaurant,
        menu_pdf_url: undefined,
        menu_pdf_name: undefined,
      };
      const next = restaurants.map((r) =>
        r.id === currentRestaurant.id ? updated : r
      );
      setRestaurants(next);
      writeStorage(STORAGE_KEYS.RESTAURANTS, next);
    }
    notify('Carte PDF supprimée.', 'info');
  };

  const handleGenerateDynamicMenuPdf = () => {
    if (!currentRestaurant) return;
    const blob = generateDynamicMenuPdfBlob(
      currentRestaurant,
      myCategories,
      myDishes
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `menu-${currentRestaurant.slug}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setPdfChoiceModalOpen(false);
    notify('Carte PDF générée automatiquement.');
  };

  const handleDownloadUploadedMenuPdf = () => {
    if (!currentRestaurant?.menu_pdf_url) return;
    const link = document.createElement('a');
    link.href = currentRestaurant.menu_pdf_url;
    link.download =
      currentRestaurant.menu_pdf_name || `carte-${currentRestaurant.slug}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setPdfChoiceModalOpen(false);
    notify('Téléchargement de votre carte PDF lancée.');
  };

  const handleMenuPdfHeaderClick = () => {
    if (currentRestaurant?.menu_pdf_url) {
      setPdfChoiceModalOpen(true);
    } else {
      handleGenerateDynamicMenuPdf();
    }
  };

  const handleSaveRestaurant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    if (!restoForm.name.trim() || !restoForm.city.trim()) {
      notify('Le nom du restaurant et la ville sont requis.', 'error');
      return;
    }

    if (currentRestaurant) {
      // TODO SUPABASE :
      // await supabase.from('restaurants').update({...}).eq('id', currentRestaurant.id).eq('owner_id', auth.uid())
      const updated: Restaurant = {
        ...currentRestaurant,
        ...restoForm,
        name: restoForm.name.trim(),
        city: restoForm.city.trim(),
        slug: currentRestaurant.slug || slugify(restoForm.name),
      };
      const next = restaurants.map((r) =>
        r.id === currentRestaurant.id ? updated : r
      );
      setRestaurants(next);
      writeStorage(STORAGE_KEYS.RESTAURANTS, next);
      notify('Informations du restaurant mises à jour.');
    } else {
      // TODO SUPABASE :
      // await supabase.from('restaurants').insert({ ...restoForm, owner_id: auth.uid() })
      // RLS Policy: owner_id = auth.uid()
      const newRestoId = generateId('rst');
      const baseSlug = slugify(restoForm.name);
      const slugExists = restaurants.some((r) => r.slug === baseSlug);
      const uniqueSlug = slugExists
        ? `${baseSlug}-${Math.random().toString(36).slice(2, 5)}`
        : baseSlug;

      const newResto: Restaurant = {
        id: newRestoId,
        owner_id: session.user_id,
        name: restoForm.name.trim(),
        slug: uniqueSlug,
        logo_url: restoForm.logo_url,
        cover_url: restoForm.cover_url,
        description: restoForm.description.trim(),
        type: restoForm.type,
        address: restoForm.address.trim(),
        city: restoForm.city.trim(),
        phone: restoForm.phone.trim(),
        whatsapp: restoForm.whatsapp.trim(),
        menu_pdf_url: restoForm.menu_pdf_url || undefined,
        menu_pdf_name: restoForm.menu_pdf_name || undefined,
        created_at: new Date().toISOString(),
      };

      const nextRestos = [...restaurants, newResto];
      setRestaurants(nextRestos);
      writeStorage(STORAGE_KEYS.RESTAURANTS, nextRestos);

      // Catégories initiales pour ce restaurant uniquement
      const initCats: Category[] = DEFAULT_CATEGORIES.map((name) => ({
        id: generateId('cat'),
        restaurant_id: newRestoId,
        name,
      }));
      const nextCats = [...categories, ...initCats];
      setCategories(nextCats);
      writeStorage(STORAGE_KEYS.CATEGORIES, nextCats);

      notify('Restaurant enregistré avec succès !');
      navigate('dashboard');
    }
  };

  // ---------- ÉTATS & HANDLERS MENU (PLATS & CATÉGORIES) ----------
  const [dishModalOpen, setDishModalOpen] = useState(false);
  const [editingDish, setEditingDish] = useState<Dish | null>(null);
  const [dishSearch, setDishSearch] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [dishForm, setDishForm] = useState<{
    name: string;
    description: string;
    price: string;
    category_id: string;
    photo_url: string;
    is_available: boolean;
    is_daily_special: boolean;
  }>({
    name: '',
    description: '',
    price: '',
    category_id: '',
    photo_url: '',
    is_available: true,
    is_daily_special: false,
  });
  const dishPhotoInputRef = useRef<HTMLInputElement | null>(null);

  const openCreateDishModal = () => {
    setEditingDish(null);
    setDishForm({
      name: '',
      description: '',
      price: '',
      category_id: myCategories[0]?.id || '',
      photo_url: '',
      is_available: true,
      is_daily_special: false,
    });
    setDishModalOpen(true);
  };

  const openEditDishModal = (dish: Dish) => {
    setEditingDish(dish);
    setDishForm({
      name: dish.name,
      description: dish.description,
      price: String(dish.price),
      category_id: dish.category_id,
      photo_url: dish.photo_url,
      is_available: dish.is_available,
      is_daily_special: dish.is_daily_special,
    });
    setDishModalOpen(true);
  };

  const handleDishPhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await fileToBase64(file);
      setDishForm((prev) => ({ ...prev, photo_url: base64 }));
    } catch {
      notify("Impossible de charger la photo du plat.", 'error');
    }
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRestaurant) return;
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    if (
      myCategories.some(
        (c) => c.name.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      notify('Cette catégorie existe déjà.', 'info');
      return;
    }
    // TODO SUPABASE : supabase.from('categories').insert({ restaurant_id: currentRestaurant.id, name: trimmed })
    const newCat: Category = {
      id: generateId('cat'),
      restaurant_id: currentRestaurant.id,
      name: trimmed,
    };
    const next = [...categories, newCat];
    setCategories(next);
    writeStorage(STORAGE_KEYS.CATEGORIES, next);
    setNewCategoryName('');
    notify(`Catégorie « ${trimmed} » ajoutée.`);
  };

  const handleSaveDish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRestaurant) return;
    const priceNum = Number(dishForm.price);
    if (!dishForm.name.trim() || Number.isNaN(priceNum) || priceNum < 0) {
      notify('Veuillez saisir un nom et un prix valide en FCFA.', 'error');
      return;
    }

    let categoryId = dishForm.category_id;
    if (!categoryId && myCategories.length > 0) {
      categoryId = myCategories[0].id;
    }

    if (editingDish) {
      // TODO SUPABASE : supabase.from('dishes').update({...}).eq('id', editingDish.id).eq('restaurant_id', currentRestaurant.id)
      const next = dishes.map((d) =>
        d.id === editingDish.id && d.restaurant_id === currentRestaurant.id
          ? {
              ...d,
              name: dishForm.name.trim(),
              description: dishForm.description.trim(),
              price: Math.round(priceNum),
              category_id: categoryId,
              photo_url: dishForm.photo_url,
              is_available: dishForm.is_available,
              is_daily_special: dishForm.is_daily_special,
            }
          : d
      );
      setDishes(next);
      writeStorage(STORAGE_KEYS.DISHES, next);
      notify('Plat mis à jour.');
    } else {
      // TODO SUPABASE : supabase.from('dishes').insert({ restaurant_id: currentRestaurant.id, ... })
      const newDish: Dish = {
        id: generateId('dsh'),
        restaurant_id: currentRestaurant.id,
        category_id: categoryId,
        name: dishForm.name.trim(),
        description: dishForm.description.trim(),
        price: Math.round(priceNum),
        photo_url: dishForm.photo_url,
        is_available: dishForm.is_available,
        is_daily_special: dishForm.is_daily_special,
      };
      const next = [newDish, ...dishes];
      setDishes(next);
      writeStorage(STORAGE_KEYS.DISHES, next);
      notify('Plat ajouté au menu.');
    }
    setDishModalOpen(false);
  };

  const toggleDishAvailability = (dishId: string) => {
    if (!currentRestaurant) return;
    const next = dishes.map((d) =>
      d.id === dishId && d.restaurant_id === currentRestaurant.id
        ? { ...d, is_available: !d.is_available }
        : d
    );
    setDishes(next);
    writeStorage(STORAGE_KEYS.DISHES, next);
  };

  const toggleDishDailySpecial = (dishId: string) => {
    if (!currentRestaurant) return;
    const next = dishes.map((d) =>
      d.id === dishId && d.restaurant_id === currentRestaurant.id
        ? { ...d, is_daily_special: !d.is_daily_special }
        : d
    );
    setDishes(next);
    writeStorage(STORAGE_KEYS.DISHES, next);
  };

  const deleteDish = (dishId: string) => {
    if (!currentRestaurant) return;
    // TODO SUPABASE : supabase.from('dishes').delete().eq('id', dishId).eq('restaurant_id', currentRestaurant.id)
    const next = dishes.filter(
      (d) => !(d.id === dishId && d.restaurant_id === currentRestaurant.id)
    );
    setDishes(next);
    writeStorage(STORAGE_KEYS.DISHES, next);
    notify('Plat supprimé.', 'info');
  };

  // ---------- ÉTATS & HANDLERS COMMANDES & PAIEMENTS MANUELS ----------
  const [orderStatusFilter, setOrderStatusFilter] = useState<
    'Toutes' | 'Nouvelles' | 'En préparation' | 'Prêtes' | 'Terminées'
  >('Toutes');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const selectedOrder = useMemo(
    () => myOrders.find((o) => o.id === selectedOrderId) ?? null,
    [myOrders, selectedOrderId]
  );

  // Notification sonore optionnelle + animation nouvelle commande + horloge relative
  const [orderSoundEnabled, setOrderSoundEnabled] = useState<boolean>(() =>
    readStorage<boolean>('rf_order_sound_v1', true)
  );
  const [highlightedOrderIds, setHighlightedOrderIds] = useState<string[]>([]);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const prevKnownOrderIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    writeStorage('rf_order_sound_v1', orderSoundEnabled);
  }, [orderSoundEnabled]);

  useEffect(() => {
    // TODO SUPABASE :
    // const { data } = await supabase
    //   .from('orders')
    //   .select('*, items:order_items(*)')
    //   .eq('restaurant_id', currentRestaurant.id)
    //   .order('created_at', { ascending: false });
    const currentIds = new Set(myOrders.map((o) => o.id));
    if (prevKnownOrderIdsRef.current === null) {
      prevKnownOrderIdsRef.current = currentIds;
      return;
    }
    const newlyArrived = myOrders.filter(
      (o) => !prevKnownOrderIdsRef.current!.has(o.id) && o.status === 'Nouvelle'
    );
    prevKnownOrderIdsRef.current = currentIds;

    if (newlyArrived.length > 0) {
      const addedIds = newlyArrived.map((o) => o.id);
      setHighlightedOrderIds((prev) => Array.from(new Set([...addedIds, ...prev])));
      if (orderSoundEnabled) {
        playOrderBeep();
      }
      const timer = setTimeout(() => {
        setHighlightedOrderIds((prev) =>
          prev.filter((id) => !addedIds.includes(id))
        );
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [myOrders, orderSoundEnabled]);

  const newOrdersCount = useMemo(
    () => myOrders.filter((o) => o.status === 'Nouvelle').length,
    [myOrders]
  );

  // Modal saisie commande comptoir/téléphone (pour tester le flux complet sans interface client publique)
  const [createOrderModalOpen, setCreateOrderModalOpen] = useState(false);
  const [newOrderCustomer, setNewOrderCustomer] = useState('');
  const [newOrderPhone, setNewOrderPhone] = useState('');
  const [newOrderTable, setNewOrderTable] = useState('Table 1');
  const [newOrderCart, setNewOrderCart] = useState<Record<string, number>>({});

  const updateOrderStatus = (orderId: string, newStatus: OrderStatus) => {
    if (!currentRestaurant) return;
    // TODO SUPABASE :
    // await supabase.from('orders').update({ status: newStatus }).eq('id', orderId).eq('restaurant_id', currentRestaurant.id)
    const next = orders.map((o) =>
      o.id === orderId && o.restaurant_id === currentRestaurant.id
        ? { ...o, status: newStatus }
        : o
    );
    setOrders(next);
    writeStorage(STORAGE_KEYS.ORDERS, next);
    notify(`Statut mis à jour : ${newStatus}`);
  };

  const confirmManualPayment = (
    orderId: string,
    targetPaymentStatus: PaymentStatus = 'recu'
  ) => {
    if (!currentRestaurant) return;
    // Confirmation manuelle OBLIGATOIRE par le restaurateur (jamais auto-payé)
    // TODO SUPABASE :
    // await supabase.from('orders').update({ payment_status: targetPaymentStatus }).eq('id', orderId)
    // await supabase.from('payments').upsert({ order_id: orderId, restaurant_id: currentRestaurant.id, status: targetPaymentStatus, confirmed_at: new Date().toISOString() })
    const nextOrders = orders.map((o) =>
      o.id === orderId && o.restaurant_id === currentRestaurant.id
        ? { ...o, payment_status: targetPaymentStatus }
        : o
    );
    setOrders(nextOrders);
    writeStorage(STORAGE_KEYS.ORDERS, nextOrders);

    const targetOrder = nextOrders.find((o) => o.id === orderId);
    if (targetOrder) {
      const existingPay = payments.find((p) => p.order_id === orderId);
      const nextPayments = existingPay
        ? payments.map((p) =>
            p.order_id === orderId
              ? {
                  ...p,
                  status: targetPaymentStatus,
                  confirmed_at: new Date().toISOString(),
                }
              : p
          )
        : [
            ...payments,
            {
              id: generateId('pay'),
              order_id: orderId,
              restaurant_id: currentRestaurant.id,
              amount: targetOrder.total,
              status: targetPaymentStatus,
              method: 'Confirmation manuelle restaurateur',
              confirmed_at: new Date().toISOString(),
            },
          ];
      setPayments(nextPayments);
      writeStorage(STORAGE_KEYS.PAYMENTS, nextPayments);
    }

    notify(
      isPaymentReceived(targetPaymentStatus)
        ? 'Paiement confirmé reçu.'
        : `Statut paiement : ${targetPaymentStatus}`
    );
  };

  const confirmPayment = (orderId: string) => {
    // TODO SUPABASE : await supabase.from('orders').update({ payment_status: 'recu' }).eq('id', orderId)
    confirmManualPayment(orderId, 'recu');
  };

  const handleCreateCounterOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentRestaurant) return;
    const chosenItems: OrderItem[] = [];
    const orderId = generateId('ord');

    Object.entries(newOrderCart).forEach(([dishId, qty]) => {
      const count = Number(qty);
      if (count > 0) {
        const dish = myDishes.find((d) => d.id === dishId);
        if (dish) {
          chosenItems.push({
            id: generateId('oi'),
            order_id: orderId,
            dish_id: dish.id,
            dish_name: dish.name,
            quantity: count,
            unit_price: dish.price,
          });
        }
      }
    });

    if (!newOrderCustomer.trim() || chosenItems.length === 0) {
      notify('Indiquez le nom du client et au moins un plat.', 'error');
      return;
    }

    const total = chosenItems.reduce(
      (sum, item) => sum + item.quantity * item.unit_price,
      0
    );
    const nextNum = 1024 + myOrders.length;
    const newOrder: Order = {
      id: orderId,
      restaurant_id: currentRestaurant.id,
      order_number: `#RF-${nextNum}`,
      customer_name: newOrderCustomer.trim(),
      customer_phone: newOrderPhone.trim() || 'Non renseigné',
      table_label: newOrderTable.trim() || 'Comptoir',
      created_at: new Date().toISOString(),
      total,
      status: 'Nouvelle',
      payment_status: 'En attente', // Jamais auto-payé !
      payment_method: 'Mobile Money / Espèces',
      items: chosenItems,
    };

    const nextOrders = [newOrder, ...orders];
    setOrders(nextOrders);
    writeStorage(STORAGE_KEYS.ORDERS, nextOrders);

    const newPayment: Payment = {
      id: generateId('pay'),
      order_id: orderId,
      restaurant_id: currentRestaurant.id,
      amount: total,
      status: 'En attente',
      method: 'Manuel (À confirmer)',
    };
    const nextPayments = [newPayment, ...payments];
    setPayments(nextPayments);
    writeStorage(STORAGE_KEYS.PAYMENTS, nextPayments);

    setCreateOrderModalOpen(false);
    setNewOrderCustomer('');
    setNewOrderPhone('');
    setNewOrderCart({});
    notify(`Commande ${newOrder.order_number} créée (paiement en attente).`);
  };

  // ---------- KPIs TABLEAU DE BORD ----------
  const dashboardStats = useMemo(() => {
    const todayOrders = myOrders.filter((o) => isTodayIso(o.created_at));
    const pendingOrders = todayOrders.filter(
      (o) =>
        o.status === 'Nouvelle' ||
        o.status === 'Confirmée' ||
        o.status === 'En préparation' ||
        o.status === 'Prête'
    );
    const completedOrders = todayOrders.filter((o) => o.status === 'Terminée');
    const revenueToday = todayOrders
      .filter((o) => o.status !== 'Annulée')
      .reduce((sum, o) => sum + o.total, 0);
    const availableDishes = myDishes.filter((d) => d.is_available).length;

    return {
      todayCount: todayOrders.length,
      pendingCount: pendingOrders.length,
      completedCount: completedOrders.length,
      revenueToday,
      availableDishes,
    };
  }, [myOrders, myDishes]);

  // ---------- QR CODE & EXPORT PNG CANVAS ----------
  const publicMenuUrl = currentRestaurant
    ? `${getPublicBaseUrl()}/r/${currentRestaurant.slug}`
    : '';
  const qrImageUrl = currentRestaurant
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
        publicMenuUrl
      )}`
    : '';

  const handleDownloadQrPng = async () => {
    if (!currentRestaurant || !qrImageUrl) return;
    try {
      const response = await fetch(qrImageUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 420;
        canvas.height = 500;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Cadre subtil
          ctx.strokeStyle = '#E5E5E5';
          ctx.lineWidth = 2;
          ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

          // Titre restaurant
          ctx.fillStyle = '#151515';
          ctx.font = 'bold 22px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(currentRestaurant.name, canvas.width / 2, 54);

          ctx.fillStyle = '#E87519';
          ctx.font = 'bold 13px sans-serif';
          ctx.fillText('SCANNEZ POUR VOIR LE MENU', canvas.width / 2, 78);

          // QR 300x300
          ctx.drawImage(img, 60, 100, 300, 300);

          // URL mono en bas
          ctx.fillStyle = '#525252';
          ctx.font = '12px monospace';
          ctx.fillText(`/r/${currentRestaurant.slug}`, canvas.width / 2, 434);

          ctx.fillStyle = '#151515';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText('RESTO FLASH', canvas.width / 2, 466);

          const pngUrl = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.href = pngUrl;
          link.download = `qr-${currentRestaurant.slug}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          notify('QR Code téléchargé en PNG.');
        }
        URL.revokeObjectURL(objectUrl);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        notify("Impossible de générer le PNG hors-ligne. Utilisez Imprimer.", 'error');
      };
      img.src = objectUrl;
    } catch {
      notify(
        'Téléchargement PNG bloqué par le réseau ; utilisez le bouton Imprimer.',
        'info'
      );
    }
  };

  const handleCopyPublicUrl = async () => {
    if (!publicMenuUrl) return;
    try {
      await navigator.clipboard.writeText(publicMenuUrl);
      notify('Lien copié dans le presse-papiers.');
    } catch {
      notify('Copie manuelle requise.', 'info');
    }
  };

  // ---------- PARAMÈTRES PROFIL ----------
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    phone: '',
  });
  useEffect(() => {
    if (currentProfile) {
      setProfileForm({
        full_name: currentProfile.full_name,
        phone: currentProfile.phone,
      });
    }
  }, [currentProfile]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProfile) return;
    // TODO SUPABASE : supabase.from('profiles').update({...}).eq('id', auth.uid())
    const next = profiles.map((p) =>
      p.id === currentProfile.id
        ? {
            ...p,
            full_name: profileForm.full_name.trim(),
            phone: profileForm.phone.trim(),
          }
        : p
    );
    setProfiles(next);
    writeStorage(STORAGE_KEYS.PROFILES, next);
    notify('Profil mis à jour.');
  };

  const handleResetDemoData = () => {
    localStorage.removeItem(STORAGE_KEYS.AUTH_USERS);
    localStorage.removeItem(STORAGE_KEYS.PROFILES);
    localStorage.removeItem(STORAGE_KEYS.RESTAURANTS);
    localStorage.removeItem(STORAGE_KEYS.CATEGORIES);
    localStorage.removeItem(STORAGE_KEYS.DISHES);
    localStorage.removeItem(STORAGE_KEYS.ORDERS);
    localStorage.removeItem(STORAGE_KEYS.PAYMENTS);
    ensureDemoSeed();
    handleDemoLogin();
  };

  // ---------- MENU FILTRÉ ----------
  const filteredDishes = useMemo(() => {
    return myDishes.filter((d) => {
      const matchesCat =
        selectedCategoryFilter === 'all' ||
        d.category_id === selectedCategoryFilter;
      const matchesSearch =
        !dishSearch.trim() ||
        d.name.toLowerCase().includes(dishSearch.trim().toLowerCase()) ||
        d.description.toLowerCase().includes(dishSearch.trim().toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [myDishes, selectedCategoryFilter, dishSearch]);

  const filteredOrders = useMemo(() => {
    if (orderStatusFilter === 'Toutes') return myOrders;
    const statusMap: Record<
      'Nouvelles' | 'En préparation' | 'Prêtes' | 'Terminées',
      OrderStatus
    > = {
      Nouvelles: 'Nouvelle',
      'En préparation': 'En préparation',
      Prêtes: 'Prête',
      Terminées: 'Terminée',
    };
    const targetStatus = statusMap[orderStatusFilter];
    return myOrders.filter((o) => o.status === targetStatus);
  }, [myOrders, orderStatusFilter]);

  const getCategoryName = (catId: string): string =>
    myCategories.find((c) => c.id === catId)?.name ?? 'Sans catégorie';

  // ---------- CONFIGURATION VISUELLE NAVIGATION (8 RUBRIQUES) ----------
  const sidebarNavItems: {
    id: View;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { id: 'restaurant', label: 'Mon restaurant', icon: Store },
    { id: 'menu', label: 'Mon menu', icon: UtensilsCrossed },
    { id: 'orders', label: 'Mes commandes', icon: ShoppingBag },
    { id: 'qrcode', label: 'Mon QR Code', icon: QrCode },
    { id: 'visuals', label: 'Visuels WhatsApp', icon: ImageIcon },
    { id: 'settings', label: 'Paramètres', icon: Settings },
  ];

  // ============================================================================
  // RENDU VUES AUTHENTIFICATION (LOGIN / REGISTER) & CONFIGURATION (SETUP)
  // ============================================================================

  if (view === 'register') {
    return (
      <div
        style={{ background: C.bg }}
        className="min-h-screen text-[#151515] flex flex-col items-center justify-center px-4 py-10"
      >
        {toast && <ToastBanner toast={toast} onClose={() => setToast(null)} />}

        <div className="w-full max-w-[380px] bg-[#FFFEF5] rounded-[24px] p-8 border border-[#F2E8D9]/60 shadow-sm">
          <div className="text-center mb-7">
            <h1 className="text-2xl font-extrabold tracking-tight text-[#151515]">
              RESTO <span className="text-[#E87519]">FLASH</span>
            </h1>
            <p className="text-sm text-neutral-500 mt-1.5">
              Créer votre espace restaurateur
            </p>
          </div>

          {authError && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                Nom complet
              </label>
              <input
                type="text"
                required
                value={regFullName}
                onChange={(e) => setRegFullName(e.target.value)}
                placeholder="Ex : Awa Koné"
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-[#FFFBF7]/50 text-sm text-[#151515] focus:outline-none focus:border-[#E87519] focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="chef@monrestaurant.ci"
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-[#FFFBF7]/50 text-sm text-[#151515] focus:outline-none focus:border-[#E87519] focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                Téléphone
              </label>
              <input
                type="tel"
                required
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                placeholder="+225 07 00 00 00 00"
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-[#FFFBF7]/50 text-sm text-[#151515] focus:outline-none focus:border-[#E87519] focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                Mot de passe
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="Minimum 6 caractères"
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-[#FFFBF7]/50 text-sm text-[#151515] focus:outline-none focus:border-[#E87519] focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                Confirmation mot de passe
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={regConfirm}
                onChange={(e) => setRegConfirm(e.target.value)}
                placeholder="Répétez le mot de passe"
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-[#FFFBF7]/50 text-sm text-[#151515] focus:outline-none focus:border-[#E87519] focus:bg-white transition-colors"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-[#E87519] hover:bg-[#d56711] text-white py-4 rounded-full font-bold text-sm transition-colors cursor-pointer mt-2"
            >
              Créer mon compte
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-neutral-600">
            Déjà un compte ?{' '}
            <button
              type="button"
              onClick={() => {
                setAuthError('');
                navigate('login');
              }}
              className="text-[#E87519] font-semibold hover:underline cursor-pointer"
            >
              Se connecter
            </button>
          </div>

          <p className="mt-5 pt-4 border-t border-neutral-100 text-[11px] text-center text-neutral-400">
            Mode localStorage actif · Connectez Supabase pour la synchronisation cloud
          </p>
        </div>
      </div>
    );
  }

  if (view === 'login') {
    return (
      <div
        style={{ background: C.bg }}
        className="min-h-screen text-[#151515] flex flex-col items-center justify-center px-4 py-10"
      >
        {toast && <ToastBanner toast={toast} onClose={() => setToast(null)} />}

        <div className="w-full max-w-[380px] bg-[#FFFEF5] rounded-[24px] p-8 border border-[#F2E8D9]/60 shadow-sm">
          <div className="text-center mb-7">
            <h1 className="text-2xl font-extrabold tracking-tight text-[#151515]">
              RESTO <span className="text-[#E87519]">FLASH</span>
            </h1>
            <p className="text-sm text-neutral-500 mt-1.5">
              Connexion Espace Restaurateur
            </p>
          </div>

          {authError && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {showForgotNotice && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              Connectez Supabase Auth pour activer l’envoi d’email de réinitialisation. En mode localStorage, créez un nouveau compte ou utilisez l’accès démo ci-dessous.
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="chef@cheztantieawa.ci"
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-[#FFFBF7]/50 text-sm text-[#151515] focus:outline-none focus:border-[#E87519] focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                Mot de passe
              </label>
              <div className="relative">
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-4 pr-12 py-3 rounded-xl border border-neutral-200 bg-[#FFFBF7]/50 text-sm text-[#151515] focus:outline-none focus:border-[#E87519] focus:bg-white transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((s) => !s)}
                  aria-label={
                    showLoginPassword
                      ? 'Masquer le mot de passe'
                      : 'Afficher le mot de passe'
                  }
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-neutral-500 hover:text-[#151515] cursor-pointer"
                >
                  {showLoginPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setShowForgotNotice((v) => !v)}
                  className="text-xs text-[#E87519] underline font-medium cursor-pointer"
                >
                  Mot de passe oublié ?
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-[#E87519] hover:bg-[#d56711] text-white py-4 rounded-full font-bold text-sm transition-colors cursor-pointer"
            >
              Se connecter
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-neutral-100 space-y-3">
            <button
              type="button"
              onClick={handleDemoLogin}
              className="w-full py-3 px-4 rounded-full border border-neutral-200 hover:border-[#151515] text-xs font-semibold text-[#151515] transition-colors cursor-pointer"
            >
              Accéder au compte démo (Chez Tantie Awa)
            </button>

            <p className="text-center text-sm text-neutral-600 pt-1">
              Nouveau restaurateur ?{' '}
              <button
                type="button"
                onClick={() => {
                  setAuthError('');
                  navigate('register');
                }}
                className="text-[#E87519] font-semibold hover:underline cursor-pointer"
              >
                Créer un compte
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'setup') {
    return (
      <div
        style={{ background: C.bg }}
        className="min-h-screen text-[#151515] px-4 py-8 sm:py-12"
      >
        {toast && <ToastBanner toast={toast} onClose={() => setToast(null)} />}

        <div className="max-w-[560px] mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className="text-sm font-extrabold tracking-tight text-white">
                RESTO <span className="text-[#E87519]">FLASH</span>
              </span>
              <h1 className="text-2xl font-bold text-white mt-1">
                Configurer mon établissement
              </h1>
              <p className="text-sm text-white/50 mt-0.5">
                Renseignez les informations de votre restaurant pour accéder au back-office.
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[44px] px-3 text-xs font-semibold text-white/60 hover:text-white flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Quitter</span>
            </button>
          </div>

          <form
            onSubmit={handleSaveRestaurant}
            className="bg-[#FFFEF5] rounded-[24px] p-6 sm:p-8 border border-[#F2E8D9]/60 space-y-5"
          >
            {/* Uploads directs téléphone : Logo rond + Couverture h-12 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#151515] mb-2">
                  Logo du restaurant
                </label>
                <input
                  ref={logoInputRef}
                  type="file"
                  hidden
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handleRestaurantImageUpload(e, 'logo_url')}
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border border-dashed border-neutral-300 hover:border-[#E87519] transition-colors cursor-pointer text-left"
                >
                  {restoForm.logo_url ? (
                    <img
                      src={restoForm.logo_url}
                      alt="Logo"
                      className="w-12 h-12 rounded-full object-cover shrink-0 border border-neutral-200"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-[#FFFBF7] border border-neutral-200 flex items-center justify-center shrink-0 text-neutral-400">
                      <Camera className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="block text-xs font-semibold text-[#151515]">
                      {restoForm.logo_url ? 'Changer le logo' : 'Importer un logo'}
                    </span>
                    <span className="block text-[11px] text-neutral-400">
                      Caméra ou galerie
                    </span>
                  </div>
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#151515] mb-2">
                  Photo de couverture
                </label>
                <input
                  ref={coverInputRef}
                  type="file"
                  hidden
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handleRestaurantImageUpload(e, 'cover_url')}
                />
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border border-dashed border-neutral-300 hover:border-[#E87519] transition-colors cursor-pointer text-left"
                >
                  {restoForm.cover_url ? (
                    <img
                      src={restoForm.cover_url}
                      alt="Couverture"
                      className="h-12 w-20 rounded-xl object-cover shrink-0 border border-neutral-200"
                    />
                  ) : (
                    <div className="h-12 w-20 rounded-xl bg-[#FFFBF7] border border-neutral-200 flex items-center justify-center shrink-0 text-neutral-400">
                      <Upload className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="block text-xs font-semibold text-[#151515]">
                      {restoForm.cover_url ? 'Changer' : 'Importer photo'}
                    </span>
                    <span className="block text-[11px] text-neutral-400">
                      Format paysage
                    </span>
                  </div>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                  Nom du restaurant *
                </label>
                <input
                  type="text"
                  required
                  value={restoForm.name}
                  onChange={(e) =>
                    setRestoForm((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="Ex : Maquis Le Palmier"
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-[#FFFBF7]/50 text-sm focus:outline-none focus:border-[#E87519] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                  Type d'établissement *
                </label>
                <select
                  value={restoForm.type}
                  onChange={(e) =>
                    setRestoForm((p) => ({
                      ...p,
                      type: e.target.value as RestaurantType,
                    }))
                  }
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-[#FFFBF7]/50 text-sm focus:outline-none focus:border-[#E87519] focus:bg-white"
                >
                  {RESTAURANT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                Description
              </label>
              <textarea
                rows={3}
                value={restoForm.description}
                onChange={(e) =>
                  setRestoForm((p) => ({ ...p, description: e.target.value }))
                }
                placeholder="Vos spécialités, ambiance et horaires..."
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-[#FFFBF7]/50 text-sm focus:outline-none focus:border-[#E87519] focus:bg-white resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                  Adresse
                </label>
                <input
                  type="text"
                  value={restoForm.address}
                  onChange={(e) =>
                    setRestoForm((p) => ({ ...p, address: e.target.value }))
                  }
                  placeholder="Quartier, rue..."
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-[#FFFBF7]/50 text-sm focus:outline-none focus:border-[#E87519] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                  Ville *
                </label>
                <input
                  type="text"
                  required
                  value={restoForm.city}
                  onChange={(e) =>
                    setRestoForm((p) => ({ ...p, city: e.target.value }))
                  }
                  placeholder="Abidjan, Dakar, Douala..."
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-[#FFFBF7]/50 text-sm focus:outline-none focus:border-[#E87519] focus:bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                  Téléphone
                </label>
                <input
                  type="tel"
                  value={restoForm.phone}
                  onChange={(e) =>
                    setRestoForm((p) => ({ ...p, phone: e.target.value }))
                  }
                  placeholder="+225 07..."
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-[#FFFBF7]/50 text-sm focus:outline-none focus:border-[#E87519] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                  WhatsApp
                </label>
                <input
                  type="tel"
                  value={restoForm.whatsapp}
                  onChange={(e) =>
                    setRestoForm((p) => ({ ...p, whatsapp: e.target.value }))
                  }
                  placeholder="+225 07..."
                  className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-[#FFFBF7]/50 text-sm focus:outline-none focus:border-[#E87519] focus:bg-white"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-[#E87519] hover:bg-[#d56711] text-white py-4 rounded-full font-bold text-sm transition-colors cursor-pointer"
            >
              Enregistrer les informations
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ============================================================================
  // SHELL PRINCIPAL BACK-OFFICE (Desktop Sidebar 260px + Mobile Bottom Tabs)
  // ============================================================================

  return (
    <div
      style={{ background: C.bg }}
      className="min-h-screen text-[#151515] flex flex-col lg:flex-row"
    >
      {toast && <ToastBanner toast={toast} onClose={() => setToast(null)} />}

      {/* SIDEBAR DESKTOP 260px STICKY */}
      <aside
        style={{ background: C.sidebar }}
        className="no-print hidden lg:flex lg:flex-col lg:w-[260px] lg:shrink-0 border-r border-white/10 sticky top-0 h-screen"
      >
        <div className="px-6 py-6 border-b border-white/10">
          <button
            type="button"
            onClick={() => navigate('dashboard')}
            className="text-xl font-extrabold tracking-tight text-white cursor-pointer text-left"
          >
            RESTO <span className="text-[#E87519]">FLASH</span>
          </button>
          {currentRestaurant && (
            <div className="mt-4 flex items-center gap-3">
              {currentRestaurant.logo_url ? (
                <img
                  src={currentRestaurant.logo_url}
                  alt={currentRestaurant.name}
                  className="w-9 h-9 rounded-full object-cover border border-white/15 shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-[#151515] border border-white/15 flex items-center justify-center text-xs font-bold text-[#E87519] shrink-0">
                  {currentRestaurant.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {currentRestaurant.name}
                </p>
                <p className="text-xs text-white/50 truncate">
                  {currentRestaurant.type} · {currentRestaurant.city}
                </p>
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {sidebarNavItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            const showOrdersBadge = item.id === 'orders' && newOrdersCount > 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#151515] text-white border border-white/10'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${active ? 'text-[#E87519]' : ''}`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {showOrdersBadge && (
                  <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[11px] font-bold tabular-nums shrink-0">
                    {newOrdersCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/10">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:bg-red-500/10 hover:text-red-400 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* CONTENU PRINCIPAL */}
      <main className="flex-1 min-w-0 pb-24 lg:pb-12">
        {/* EN-TÊTE MOBILE COMPACT (Non sticky pour respecter le cap 15% sticky mobile) */}
        <div className="no-print lg:hidden flex items-center justify-between px-4 pt-5 pb-2">
          <span className="text-lg font-extrabold tracking-tight text-white">
            RESTO <span className="text-[#E87519]">FLASH</span>
          </span>
          {currentRestaurant && (
            <span className="text-xs text-white/60 truncate max-w-[180px]">
              {currentRestaurant.name}
            </span>
          )}
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-8">
          {/* ============================================================== */}
          {/* D. TABLEAU DE BORD                                             */}
          {/* ============================================================== */}
          {view === 'dashboard' && currentRestaurant && (
            <div className="space-y-6">
              {/* Header Bonjour Chef */}
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                    Bonjour Chef
                  </h1>
                  <p className="text-sm text-white font-medium mt-1">
                    {currentRestaurant.name} {currentRestaurant.city}
                  </p>
                </div>
                <span className="text-xs text-white/50">
                  Mode localStorage · Connectez Supabase pour le temps réel
                </span>
              </div>

              {/* KPI Grid : 2 cols mobile, 3 cols desktop */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                <div className="bg-[#FFFEF5] border border-[#F2E8D9]/60 rounded-2xl p-4">
                  <p className="text-xs text-neutral-600 font-medium">
                    Commandes du jour
                  </p>
                  <p className="text-2xl font-bold text-[#151515] mt-2 tabular-nums">
                    {dashboardStats.todayCount}
                  </p>
                </div>

                <div className="bg-[#FFFEF5] border border-[#F2E8D9]/60 rounded-2xl p-4">
                  <p className="text-xs text-neutral-600 font-medium">
                    En attente
                  </p>
                  <p className="text-2xl font-bold text-[#151515] mt-2 tabular-nums">
                    {dashboardStats.pendingCount}
                  </p>
                </div>

                <div className="bg-[#FFFEF5] border border-[#F2E8D9]/60 rounded-2xl p-4">
                  <p className="text-xs text-neutral-600 font-medium">
                    Terminées
                  </p>
                  <p className="text-2xl font-bold text-[#151515] mt-2 tabular-nums">
                    {dashboardStats.completedCount}
                  </p>
                </div>

                <div className="bg-[#FFFEF5] border border-[#F2E8D9]/60 rounded-2xl p-4">
                  <p className="text-xs text-neutral-600 font-medium">
                    CA du jour
                  </p>
                  <p className="text-2xl font-bold text-[#E87519] mt-2 tabular-nums">
                    {formatFCFA(dashboardStats.revenueToday)}
                  </p>
                </div>

                <div className="bg-[#FFFEF5] border border-[#F2E8D9]/60 rounded-2xl p-4 col-span-2 lg:col-span-1">
                  <p className="text-xs text-neutral-600 font-medium">
                    Plats dispo
                  </p>
                  <p className="text-2xl font-bold text-[#151515] mt-2 tabular-nums">
                    {dashboardStats.availableDishes}
                  </p>
                </div>
              </div>

              {/* Raccourcis 2 cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <button
                  type="button"
                  onClick={() => navigate('menu')}
                  className="bg-[#FFFEF5] border border-[#F2E8D9]/60 hover:border-[#E87519] rounded-2xl p-5 flex items-center justify-between text-left transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-white/80 border border-[#F2E8D9]/60 flex items-center justify-center text-[#E87519]">
                      <UtensilsCrossed className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-[#151515] text-sm">
                        Gérer mon menu
                      </p>
                      <p className="text-xs text-neutral-600 mt-0.5">
                        {myDishes.length} plats enregistrés
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-neutral-500 group-hover:text-[#E87519] transition-colors" />
                </button>

                <button
                  type="button"
                  onClick={() => navigate('qrcode')}
                  className="bg-[#FFFEF5] border border-[#F2E8D9]/60 hover:border-[#E87519] rounded-2xl p-5 flex items-center justify-between text-left transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-white/80 border border-[#F2E8D9]/60 flex items-center justify-center text-[#E87519]">
                      <QrCode className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-[#151515] text-sm">
                        Voir QR Code
                      </p>
                      <p className="text-xs text-neutral-600 mt-0.5">
                        QR unique de l'établissement
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-neutral-500 group-hover:text-[#E87519] transition-colors" />
                </button>
              </div>

              {/* Section Commandes récentes */}
              <section className="bg-[#FFFEF5] rounded-2xl p-5 border border-[#F2E8D9]/60">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-[#151515]">
                    Commandes récentes
                  </h2>
                  <button
                    type="button"
                    onClick={() => navigate('orders')}
                    className="text-xs font-semibold text-[#E87519] hover:underline cursor-pointer"
                  >
                    Voir tout
                  </button>
                </div>

                {myOrders.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-sm text-neutral-500">
                      Aucune commande enregistrée pour cet établissement.
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate('orders')}
                      className="mt-3 px-4 py-2 rounded-full bg-[#E87519] text-white text-xs font-semibold cursor-pointer"
                    >
                      Ouvrir les commandes
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-neutral-100">
                    {myOrders.slice(0, 5).map((order) => (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => {
                          setSelectedOrderId(order.id);
                        }}
                        className="w-full py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[#FFFBF7] -mx-2 px-2 rounded-xl transition-colors cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-mono font-semibold text-[#151515]">
                              {order.order_number}
                            </span>
                            <span className="text-neutral-300">·</span>
                            <span className="font-medium text-[#151515] truncate">
                              {order.customer_name}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-500 mt-0.5 tabular-nums">
                            {order.table_label} · {formatDateTime(order.created_at)}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-bold text-[#E87519] tabular-nums">
                            {formatFCFA(order.total)}
                          </span>
                          <span className="px-2.5 py-1 rounded-md bg-[#151515] text-white text-[11px] font-medium whitespace-nowrap">
                            {order.status}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ============================================================== */}
          {/* E.1 MON RESTAURANT                                             */}
          {/* ============================================================== */}
          {view === 'restaurant' && currentRestaurant && (
            <div className="space-y-6 max-w-[640px]">
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Mon restaurant
                </h1>
                <p className="text-sm text-white/50 mt-1">
                  Identité et coordonnées de votre établissement.
                </p>
              </div>

              <form
                onSubmit={handleSaveRestaurant}
                className="bg-[#FFFEF5] rounded-2xl p-6 border border-[#F2E8D9]/60 space-y-5"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#151515] mb-2">
                      Logo
                    </label>
                    <input
                      ref={logoInputRef}
                      type="file"
                      hidden
                      accept="image/*"
                      capture="environment"
                      onChange={(e) =>
                        handleRestaurantImageUpload(e, 'logo_url')
                      }
                    />
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="w-full flex items-center gap-3 p-3 rounded-2xl border border-dashed border-neutral-300 hover:border-[#E87519] transition-colors cursor-pointer text-left"
                    >
                      {restoForm.logo_url ? (
                        <img
                          src={restoForm.logo_url}
                          alt="Logo"
                          className="w-12 h-12 rounded-full object-cover border border-neutral-200 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-[#FFFBF7] border border-neutral-200 flex items-center justify-center text-neutral-400 shrink-0">
                          <Camera className="w-5 h-5" />
                        </div>
                      )}
                      <div>
                        <span className="block text-xs font-semibold text-[#151515]">
                          Importer / prendre photo
                        </span>
                        <span className="block text-[11px] text-neutral-400">
                          Base64 direct
                        </span>
                      </div>
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#151515] mb-2">
                      Photo de couverture
                    </label>
                    <input
                      ref={coverInputRef}
                      type="file"
                      hidden
                      accept="image/*"
                      capture="environment"
                      onChange={(e) =>
                        handleRestaurantImageUpload(e, 'cover_url')
                      }
                    />
                    <button
                      type="button"
                      onClick={() => coverInputRef.current?.click()}
                      className="w-full flex items-center gap-3 p-3 rounded-2xl border border-dashed border-neutral-300 hover:border-[#E87519] transition-colors cursor-pointer text-left"
                    >
                      {restoForm.cover_url ? (
                        <img
                          src={restoForm.cover_url}
                          alt="Couverture"
                          className="h-12 w-20 rounded-xl object-cover border border-neutral-200 shrink-0"
                        />
                      ) : (
                        <div className="h-12 w-20 rounded-xl bg-[#FFFBF7] border border-neutral-200 flex items-center justify-center text-neutral-400 shrink-0">
                          <Upload className="w-5 h-5" />
                        </div>
                      )}
                      <div>
                        <span className="block text-xs font-semibold text-[#151515]">
                          Importer couverture
                        </span>
                        <span className="block text-[11px] text-neutral-400">
                          Aperçu h-12
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                      Nom restaurant
                    </label>
                    <input
                      type="text"
                      required
                      value={restoForm.name}
                      onChange={(e) =>
                        setRestoForm((p) => ({ ...p, name: e.target.value }))
                      }
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-[#E87519]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                      Type d'établissement
                    </label>
                    <select
                      value={restoForm.type}
                      onChange={(e) =>
                        setRestoForm((p) => ({
                          ...p,
                          type: e.target.value as RestaurantType,
                        }))
                      }
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-[#E87519]"
                    >
                      {RESTAURANT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={restoForm.description}
                    onChange={(e) =>
                      setRestoForm((p) => ({
                        ...p,
                        description: e.target.value,
                      }))
                    }
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-[#E87519] resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                      Adresse
                    </label>
                    <input
                      type="text"
                      value={restoForm.address}
                      onChange={(e) =>
                        setRestoForm((p) => ({ ...p, address: e.target.value }))
                      }
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-[#E87519]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                      Ville
                    </label>
                    <input
                      type="text"
                      required
                      value={restoForm.city}
                      onChange={(e) =>
                        setRestoForm((p) => ({ ...p, city: e.target.value }))
                      }
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-[#E87519]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      value={restoForm.phone}
                      onChange={(e) =>
                        setRestoForm((p) => ({ ...p, phone: e.target.value }))
                      }
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-[#E87519]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                      WhatsApp
                    </label>
                    <input
                      type="tel"
                      value={restoForm.whatsapp}
                      onChange={(e) =>
                        setRestoForm((p) => ({ ...p, whatsapp: e.target.value }))
                      }
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-[#E87519]"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-neutral-500">
                    Slug réservé phase 2 :{' '}
                    <span className="font-mono text-[#151515]">
                      /r/{currentRestaurant.slug}
                    </span>
                  </div>
                  <button
                    type="submit"
                    className="bg-[#E87519] hover:bg-[#d56711] text-white px-6 py-3 rounded-full text-sm font-bold transition-colors cursor-pointer"
                  >
                    Enregistrer les informations
                  </button>
                </div>
              </form>

              {/* Ma carte PDF (optionnel) */}
              <section className="bg-[#FFFEF5] border border-[#F2E8D9]/60 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#E87519]" />
                    <h2 className="text-sm font-bold text-[#151515]">
                      Carte PDF complète
                    </h2>
                  </div>
                  <span className="text-[11px] text-neutral-500">
                    Ma carte PDF (optionnel)
                  </span>
                </div>

                {restoForm.menu_pdf_url && (
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-white border border-[#F2E8D9]/60">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-4 h-4 text-[#E87519] shrink-0" />
                      <span className="text-xs font-semibold text-[#151515] truncate">
                        {restoForm.menu_pdf_name || 'carte-menu.pdf'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPdfPreviewOpen(true)}
                        className="px-3 py-1.5 rounded-full border border-neutral-200 hover:border-[#151515] text-xs font-semibold text-[#151515] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Voir</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteMenuPdf}
                        className="px-3 py-1.5 rounded-full border border-red-200 hover:bg-red-50 text-xs font-semibold text-red-600 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                        <span>Supprimer</span>
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => pdfInputRef.current?.click()}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border border-dashed border-neutral-300 hover:border-[#E87519] transition-colors cursor-pointer text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#FFFBF7] border border-neutral-200 flex items-center justify-center text-neutral-500 shrink-0">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-xs font-semibold text-[#151515]">
                      Prendre / choisir un PDF
                    </span>
                    <span className="block text-[11px] text-neutral-400">
                      Encodage direct base64 · Max 10 Mo
                    </span>
                  </div>
                </button>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveMenuPdf}
                    className="bg-[#E87519] hover:bg-[#d56711] text-white px-5 py-2.5 rounded-full text-xs font-bold cursor-pointer"
                  >
                    Enregistrer
                  </button>
                </div>
              </section>
            </div>
          )}

          {/* ============================================================== */}
          {/* E.2 MON MENU                                                   */}
          {/* ============================================================== */}
          {view === 'menu' && currentRestaurant && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-white">Mon menu</h1>
                  <p className="text-sm text-white/50 mt-0.5 tabular-nums">
                    {myDishes.length} plats ·{' '}
                    {myDishes.filter((d) => d.is_available).length} disponibles
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleMenuPdfHeaderClick}
                    className="bg-[#FFFEF5] hover:bg-neutral-100 text-[#151515] border border-[#F2E8D9]/60 px-4 py-3 rounded-full font-bold text-xs inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <FileText className="w-4 h-4 text-[#E87519]" />
                    <span>Télécharger PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={openCreateDishModal}
                    className="bg-[#E87519] hover:bg-[#d56711] text-white px-5 py-3 rounded-full font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Ajouter un plat</span>
                  </button>
                </div>
              </div>

              {/* Barre recherche + filtre catégories + ajout rapide catégorie */}
              <div className="bg-[#FFFEF5] border border-[#F2E8D9]/60 rounded-2xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={dishSearch}
                      onChange={(e) => setDishSearch(e.target.value)}
                      placeholder="Rechercher un plat..."
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-[#E87519]"
                    />
                  </div>
                  <form
                    onSubmit={handleAddCategory}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Nouvelle catégorie..."
                      className="px-3.5 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-[#E87519] w-full sm:w-44"
                    />
                    <button
                      type="submit"
                      className="px-3.5 py-2.5 rounded-xl border border-neutral-200 hover:border-[#151515] text-xs font-semibold text-[#151515] whitespace-nowrap cursor-pointer"
                    >
                      + Catégorie
                    </button>
                  </form>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryFilter('all')}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      selectedCategoryFilter === 'all'
                        ? 'bg-[#151515] text-white'
                        : 'bg-neutral-100 text-neutral-600 hover:text-[#151515]'
                    }`}
                  >
                    Toutes ({myDishes.length})
                  </button>
                  {myCategories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategoryFilter(cat.id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        selectedCategoryFilter === cat.id
                          ? 'bg-[#151515] text-white'
                          : 'bg-neutral-100 text-neutral-600 hover:text-[#151515]'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Liste des plats */}
              {filteredDishes.length === 0 ? (
                <div className="bg-[#FFFEF5] border border-[#F2E8D9]/60 rounded-2xl p-10 text-center">
                  <UtensilsCrossed className="w-8 h-8 text-neutral-400 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-[#151515]">
                    Aucun plat trouvé
                  </p>
                  <p className="text-xs text-neutral-600 mt-1">
                    Ajoutez votre premier plat ou modifiez votre filtre.
                  </p>
                  <button
                    type="button"
                    onClick={openCreateDishModal}
                    className="mt-4 bg-[#E87519] text-white px-5 py-2.5 rounded-full text-xs font-bold cursor-pointer"
                  >
                    Ajouter un plat
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredDishes.map((dish) => (
                    <div
                      key={dish.id}
                      className="bg-[#FFFEF5] border border-[#F2E8D9]/60 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {dish.photo_url ? (
                          <img
                            src={dish.photo_url}
                            alt={dish.name}
                            className="w-12 h-12 rounded-xl object-cover bg-neutral-100 shrink-0 border border-neutral-100"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-400 shrink-0">
                            <UtensilsCrossed className="w-5 h-5" />
                          </div>
                        )}

                        <div className="min-w-0">
                          <p className="font-bold text-sm text-[#151515] truncate">
                            {dish.name}
                          </p>
                          <div className="flex items-center gap-2 text-xs mt-0.5">
                            <span className="font-bold text-[#E87519] tabular-nums">
                              {formatFCFA(dish.price)}
                            </span>
                            <span className="text-neutral-300">·</span>
                            <span className="text-neutral-500 truncate">
                              {getCategoryName(dish.category_id)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-100">
                        {/* Checkbox Plat du jour */}
                        <label className="inline-flex items-center gap-2 text-xs text-neutral-600 cursor-pointer select-none min-h-[40px]">
                          <input
                            type="checkbox"
                            checked={dish.is_daily_special}
                            onChange={() => toggleDishDailySpecial(dish.id)}
                            className="w-4 h-4 accent-[#E87519] rounded cursor-pointer"
                          />
                          <span>Plat du jour</span>
                        </label>

                        {/* Toggle disponibilité custom orange */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={dish.is_available}
                          aria-label={`Disponibilité de ${dish.name}`}
                          onClick={() => toggleDishAvailability(dish.id)}
                          className="inline-flex items-center gap-2 cursor-pointer min-h-[40px]"
                        >
                          <span
                            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                              dish.is_available
                                ? 'bg-[#E87519]'
                                : 'bg-neutral-200'
                            }`}
                          >
                            <span
                              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                                dish.is_available
                                  ? 'translate-x-5.5'
                                  : 'translate-x-0.5'
                              }`}
                            />
                          </span>
                        </button>

                        {/* Actions Modifier / Supprimer */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditDishModal(dish)}
                            aria-label={`Modifier ${dish.name}`}
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-neutral-500 hover:bg-neutral-100 hover:text-[#151515] cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteDish(dish.id)}
                            aria-label={`Supprimer ${dish.name}`}
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-neutral-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Ma carte PDF (optionnel) */}
              <section className="bg-[#FFFEF5] border border-[#F2E8D9]/60 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#E87519]" />
                    <h2 className="text-sm font-bold text-[#151515]">
                      Carte PDF complète
                    </h2>
                  </div>
                  <span className="text-[11px] text-neutral-500">
                    Ma carte PDF (optionnel)
                  </span>
                </div>

                {restoForm.menu_pdf_url && (
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-white border border-[#F2E8D9]/60">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-4 h-4 text-[#E87519] shrink-0" />
                      <span className="text-xs font-semibold text-[#151515] truncate">
                        {restoForm.menu_pdf_name || 'carte-menu.pdf'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPdfPreviewOpen(true)}
                        className="px-3 py-1.5 rounded-full border border-neutral-200 hover:border-[#151515] text-xs font-semibold text-[#151515] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Voir</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteMenuPdf}
                        className="px-3 py-1.5 rounded-full border border-red-200 hover:bg-red-50 text-xs font-semibold text-red-600 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                        <span>Supprimer</span>
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => pdfInputRef.current?.click()}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border border-dashed border-neutral-300 hover:border-[#E87519] transition-colors cursor-pointer text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#FFFBF7] border border-neutral-200 flex items-center justify-center text-neutral-500 shrink-0">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-xs font-semibold text-[#151515]">
                      Prendre / choisir un PDF
                    </span>
                    <span className="block text-[11px] text-neutral-400">
                      Encodage direct base64 · Max 10 Mo
                    </span>
                  </div>
                </button>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveMenuPdf}
                    className="bg-[#E87519] hover:bg-[#d56711] text-white px-5 py-2.5 rounded-full text-xs font-bold cursor-pointer"
                  >
                    Enregistrer
                  </button>
                </div>
              </section>
            </div>
          )}

          {/* ============================================================== */}
          {/* E.3 MES COMMANDES                                              */}
          {/* ============================================================== */}
          {view === 'orders' && currentRestaurant && (
            <div className="space-y-5">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-[24px] font-black text-white tracking-tight">
                    Mes commandes
                  </h1>
                  <p className="text-sm text-white/50 mt-0.5 tabular-nums">
                    {myOrders.length} commande{myOrders.length > 1 ? 's' : ''} ·{' '}
                    {newOrdersCount} nouvelle{newOrdersCount > 1 ? 's' : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !orderSoundEnabled;
                      setOrderSoundEnabled(next);
                      if (next) playOrderBeep();
                      notify(
                        next
                          ? 'Notification sonore activée.'
                          : 'Notification sonore désactivée.',
                        'info'
                      );
                    }}
                    className={`px-3.5 py-2.5 rounded-full text-xs font-semibold border inline-flex items-center gap-1.5 cursor-pointer transition-transform hover:scale-105 whitespace-nowrap shrink-0 ${
                      orderSoundEnabled
                        ? 'bg-[#FFFEF5] border-[#F2E8D9] text-[#151515]'
                        : 'bg-[#151515] border-white/20 text-white/60'
                    }`}
                  >
                    {orderSoundEnabled ? (
                      <Volume2 className="w-4 h-4 text-[#E87519]" />
                    ) : (
                      <VolumeX className="w-4 h-4" />
                    )}
                    <span>{orderSoundEnabled ? 'Son actif' : 'Son coupé'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCreateOrderModalOpen(true)}
                    className="bg-[#E87519] hover:bg-[#d56711] text-white px-5 py-2.5 rounded-full text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-transform hover:scale-105 whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Nouvelle commande</span>
                  </button>
                </div>
              </div>

              {/* Filtres pill : Toutes | Nouvelles (orange) | En préparation | Prêtes | Terminées */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                {(
                  [
                    {
                      key: 'Toutes' as const,
                      label: 'Toutes',
                      count: myOrders.length,
                      isOrange: false,
                    },
                    {
                      key: 'Nouvelles' as const,
                      label: 'Nouvelles',
                      count: myOrders.filter((o) => o.status === 'Nouvelle').length,
                      isOrange: true,
                    },
                    {
                      key: 'En préparation' as const,
                      label: 'En préparation',
                      count: myOrders.filter((o) => o.status === 'En préparation')
                        .length,
                      isOrange: false,
                    },
                    {
                      key: 'Prêtes' as const,
                      label: 'Prêtes',
                      count: myOrders.filter((o) => o.status === 'Prête').length,
                      isOrange: false,
                    },
                    {
                      key: 'Terminées' as const,
                      label: 'Terminées',
                      count: myOrders.filter((o) => o.status === 'Terminée').length,
                      isOrange: false,
                    },
                  ] as const
                ).map((pill) => {
                  const active = orderStatusFilter === pill.key;
                  return (
                    <button
                      key={pill.key}
                      type="button"
                      onClick={() => setOrderStatusFilter(pill.key)}
                      className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-all hover:scale-105 inline-flex items-center gap-1.5 ${
                        active
                          ? 'bg-[#151515] text-white border border-white/30'
                          : pill.isOrange
                          ? 'bg-[#FFFEF5] border border-[#E87519] text-[#E87519]'
                          : 'bg-[#FFFEF5] border border-[#F2E8D9] text-[#151515]'
                      }`}
                    >
                      <span>{pill.label}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-black tabular-nums ${
                          active
                            ? pill.isOrange
                              ? 'bg-[#E87519] text-white'
                              : 'bg-white/15 text-white'
                            : pill.isOrange
                            ? 'bg-[#E87519] text-white'
                            : 'bg-[#F2E8D9]/70 text-[#151515]'
                        }`}
                      >
                        {pill.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Liste des commandes */}
              {filteredOrders.length === 0 ? (
                <div className="bg-[#FFFEF5] border border-[#F2E8D9] rounded-2xl p-10 text-center">
                  <div className="text-4xl mb-3" aria-hidden="true">
                    🍽️
                  </div>
                  <p className="text-base font-bold text-[#151515]">
                    Aucune commande pour le moment
                  </p>
                  <p className="text-xs text-neutral-600 mt-1.5 max-w-sm mx-auto leading-relaxed">
                    Les commandes de vos clients apparaîtront ici dès qu&apos;ils
                    scanneront votre QR Code
                  </p>
                </div>
              ) : (
                <div>
                  {filteredOrders.map((order) => {
                    const paid = isPaymentReceived(order.payment_status);
                    const isHighlighted = highlightedOrderIds.includes(order.id);
                    const displayCode = formatOrderCode(order.order_number);
                    const relativeTime = formatDistanceToNow(
                      order.created_at,
                      nowTick
                    );

                    return (
                      <article
                        key={order.id}
                        className={`bg-[#FFFEF5] rounded-2xl border p-4 mb-3 transition-all ${
                          isHighlighted
                            ? 'animate-order-slide-down border-[#E87519] ring-2 ring-[#E87519]/40 bg-[#FFF8EE]'
                            : 'border-[#F2E8D9]'
                        }`}
                      >
                        {/* Top : #Commande-XXXX - temps relatif + badge statut couleur */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#F2E8D9]">
                          <div className="flex items-center gap-2 text-xs sm:text-sm">
                            <span className="font-mono font-black text-[#151515]">
                              {displayCode}
                            </span>
                            <span className="text-neutral-400">-</span>
                            <span className="text-xs font-medium text-neutral-600 tabular-nums">
                              {relativeTime}
                            </span>
                          </div>

                          <span
                            className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${
                              ORDER_STATUS_BADGE_STYLES[order.status]
                            }`}
                          >
                            {order.status}
                          </span>
                        </div>

                        {/* Client : Nom + Téléphone + Table */}
                        <div className="py-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-bold text-[#151515]">
                          <span>{order.customer_name}</span>
                          <span className="text-neutral-300">·</span>
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Phone className="w-3.5 h-3.5 text-[#E87519]" />
                            {order.customer_phone}
                          </span>
                          <span className="text-neutral-300">·</span>
                          <span className="px-2 py-0.5 rounded-md bg-white border border-[#F2E8D9] text-xs font-bold text-[#151515]">
                            {order.table_label}
                          </span>
                        </div>

                        {/* Détails plats : nom x quantité - prix */}
                        <div className="bg-white/80 border border-[#F2E8D9] rounded-xl px-3.5 py-2.5 space-y-1.5">
                          {order.items.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between gap-3 text-xs sm:text-[13px] text-[#151515]"
                            >
                              <span className="font-medium truncate">
                                {item.dish_name}{' '}
                                <span className="font-bold text-[#E87519] tabular-nums">
                                  x{item.quantity}
                                </span>
                              </span>
                              <span className="font-bold tabular-nums shrink-0">
                                - {formatFCFA(item.quantity * item.unit_price)}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Total + Paiement */}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-[16px] font-black text-[#151515] tabular-nums">
                              Total: {formatFCFA(order.total)}
                            </p>
                            <p className="text-xs text-neutral-600 mt-0.5">
                              Paiement:{' '}
                              <span className="font-semibold text-[#151515]">
                                {order.payment_method || 'Mobile Money / Espèces'}
                              </span>
                            </p>
                          </div>

                          <span
                            className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${
                              paid
                                ? 'bg-green-100 text-green-800'
                                : order.payment_status === 'Remboursé'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-200 text-gray-700'
                            }`}
                          >
                            {paid
                              ? 'Reçu'
                              : order.payment_status === 'Remboursé'
                              ? 'Remboursé'
                              : 'En attente'}
                          </span>
                        </div>

                        {/* Boutons d'actions en bas selon statut */}
                        <div className="mt-4 pt-3 border-t border-[#F2E8D9] flex flex-wrap items-center gap-2">
                          {order.status === 'Nouvelle' && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  updateOrderStatus(order.id, 'Confirmée')
                                }
                                className="px-3.5 py-2 rounded-full bg-white border border-neutral-300 text-[#151515] text-xs font-bold cursor-pointer transition-transform hover:scale-105"
                              >
                                Confirmée
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateOrderStatus(order.id, 'En préparation')
                                }
                                className="px-3.5 py-2 rounded-full bg-[#151515] text-white text-xs font-bold cursor-pointer transition-transform hover:scale-105"
                              >
                                En préparation
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateOrderStatus(order.id, 'Annulée')
                                }
                                className="px-3 py-2 rounded-full text-red-600 hover:bg-red-50 text-xs font-bold cursor-pointer transition-transform hover:scale-105"
                              >
                                Annuler
                              </button>
                            </>
                          )}

                          {order.status === 'Confirmée' && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  updateOrderStatus(order.id, 'En préparation')
                                }
                                className="px-3.5 py-2 rounded-full bg-[#151515] text-white text-xs font-bold cursor-pointer transition-transform hover:scale-105"
                              >
                                En préparation
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updateOrderStatus(order.id, 'Prête')
                                }
                                className="px-3.5 py-2 rounded-full bg-white border border-neutral-300 text-[#151515] text-xs font-bold cursor-pointer transition-transform hover:scale-105"
                              >
                                Prête
                              </button>
                            </>
                          )}

                          {order.status === 'En préparation' && (
                            <button
                              type="button"
                              onClick={() => updateOrderStatus(order.id, 'Prête')}
                              className="px-3.5 py-2 rounded-full bg-[#151515] text-white text-xs font-bold cursor-pointer transition-transform hover:scale-105"
                            >
                              Prête
                            </button>
                          )}

                          {order.status === 'Prête' && (
                            <button
                              type="button"
                              onClick={() =>
                                updateOrderStatus(order.id, 'Terminée')
                              }
                              className="px-4 py-2 rounded-full bg-[#E87519] text-white text-xs font-bold cursor-pointer transition-transform hover:scale-105"
                            >
                              Terminée
                            </button>
                          )}

                          {/* Toujours : Confirmer paiement reçu (manuel obligatoire) si non reçu */}
                          {!paid && order.payment_status !== 'Remboursé' && (
                            <button
                              type="button"
                              onClick={() => confirmPayment(order.id)}
                              className="px-3.5 py-2 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-transform hover:scale-105"
                            >
                              <Banknote className="w-3.5 h-3.5" />
                              <span>Confirmer paiement reçu</span>
                            </button>
                          )}

                          {/* Toujours : Contacter client WhatsApp */}
                          <a
                            href={buildWhatsAppOrderUrl(order)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3.5 py-2 rounded-full bg-white border border-[#F2E8D9] hover:border-green-600 text-[#151515] text-xs font-bold inline-flex items-center gap-1.5 transition-transform hover:scale-105 ml-auto"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-green-600" />
                            <span>Contacter client WhatsApp</span>
                          </a>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* E.4 MON QR CODE (1 seul QR code par restaurant)                */}
          {/* ============================================================== */}
          {view === 'qrcode' && currentRestaurant && (
            <div className="space-y-6 max-w-[560px] mx-auto">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-white">
                  Mon QR Code
                </h1>
                <p className="text-sm text-white/50 mt-1">
                  Un seul QR Code unique pour l’ensemble de votre restaurant.
                </p>
              </div>

              <div className="bg-[#FFFEF5] rounded-3xl p-6 sm:p-8 border border-[#F2E8D9]/60 flex flex-col items-center text-center">
                <p className="text-sm font-bold text-[#151515] mb-4">
                  {currentRestaurant.name}
                </p>

                <div className="bg-white p-3 rounded-2xl border border-[#F2E8D9]/60 inline-flex items-center justify-center">
                  <img
                    src={qrImageUrl}
                    alt={`QR Code ${currentRestaurant.name}`}
                    width={300}
                    height={300}
                    referrerPolicy="no-referrer"
                    className="w-[240px] h-[240px] sm:w-[300px] sm:h-[300px] object-contain"
                  />
                </div>

                <div className="mt-5 w-full flex items-center justify-center gap-2 bg-[#FFFBF7] border border-neutral-200 rounded-xl px-3.5 py-2.5">
                  <span className="font-mono text-xs text-[#151515] truncate">
                    {publicMenuUrl}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyPublicUrl}
                    aria-label="Copier le lien"
                    className="p-1.5 text-neutral-500 hover:text-[#E87519] cursor-pointer shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-xs text-[#E87519] font-medium mt-3">
                  Redirigera vers page publique phase 2
                </p>

                <div className="no-print mt-6 w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleDownloadQrPng}
                    className="bg-[#E87519] hover:bg-[#d56711] text-white py-3.5 px-5 rounded-full font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Télécharger PNG</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="bg-[#151515] hover:bg-neutral-800 text-white py-3.5 px-5 rounded-full font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Imprimer</span>
                  </button>
                </div>

                {currentRestaurant.menu_pdf_url && (
                  <div className="no-print mt-6 w-full pt-5 border-t border-[#F2E8D9]/60 space-y-2">
                    <p className="text-[11px] font-medium text-neutral-500">
                      Bouton affiché côté client sur /r/{currentRestaurant.slug}
                    </p>
                    <a
                      href={currentRestaurant.menu_pdf_url}
                      download={
                        currentRestaurant.menu_pdf_name ||
                        `carte-${currentRestaurant.slug}.pdf`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-[#151515] hover:bg-neutral-800 text-white rounded-full py-3 px-5 font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors"
                    >
                      <FileText className="w-4 h-4 text-[#E87519]" />
                      <span>Télécharger la carte complète (PDF)</span>
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* E.5 VISUELS WHATSAPP                                           */}
          {/* ============================================================== */}
          {view === 'visuals' && currentRestaurant && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Visuels WhatsApp
                </h1>
                <p className="text-sm text-white/50 mt-1">
                  Modèles préparés pour vos statuts WhatsApp (format Story 1080×1920).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  {
                    title: 'Menu du jour',
                    count: myDishes.filter((d) => d.is_daily_special).length,
                    hint: 'Plats cochés « Plat du jour »',
                  },
                  {
                    title: 'Offre spéciale',
                    count: null,
                    hint: 'Promotions & formules midi',
                  },
                  {
                    title: 'Plat vedette',
                    count: null,
                    hint: 'Mise en avant d’un best-seller',
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="bg-[#FFFEF5] rounded-2xl border-2 border-dashed border-[#F2E8D9]/60 p-6 flex flex-col items-center justify-center text-center min-h-[240px]"
                  >
                    <ImageIcon className="w-10 h-10 text-[#151515] opacity-40 mb-4" />
                    <h2 className="text-base font-bold text-[#151515]">
                      {item.title}
                    </h2>
                    <p className="text-xs text-neutral-600 mt-1.5 max-w-[220px]">
                      Générateur canvas 1080x1920 à brancher phase 2
                    </p>
                    <p className="text-[11px] text-neutral-500 mt-3">
                      {item.count !== null
                        ? `${item.count} plat(s) du jour prêt(s)`
                        : item.hint}
                    </p>
                  </div>
                ))}
              </div>

              <div className="bg-[#FFFEF5] border border-[#F2E8D9]/60 rounded-2xl p-4 text-xs text-neutral-700 flex items-start gap-3">
                <Database className="w-4 h-4 text-[#E87519] shrink-0 mt-0.5" />
                <span>
                  Connectez Supabase Storage et le moteur de rendu Canvas 1080×1920 en Phase 2 pour exporter et partager vos visuels directement sur WhatsApp Business.
                </span>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* E.6 PARAMÈTRES                                                 */}
          {/* ============================================================== */}
          {view === 'settings' && currentProfile && (
            <div className="space-y-6 max-w-[600px]">
              <div>
                <h1 className="text-2xl font-bold text-white">Paramètres</h1>
                <p className="text-sm text-white/50 mt-1">
                  Compte gérant et état de la connexion backend.
                </p>
              </div>

              {/* Profil gérant */}
              <form
                onSubmit={handleSaveProfile}
                className="bg-[#FFFEF5] border border-[#F2E8D9]/60 rounded-2xl p-6 space-y-4"
              >
                <h2 className="text-sm font-bold text-[#151515]">
                  Profil gérant
                </h2>

                <div>
                  <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                    Nom complet
                  </label>
                  <input
                    type="text"
                    required
                    value={profileForm.full_name}
                    onChange={(e) =>
                      setProfileForm((p) => ({
                        ...p,
                        full_name: e.target.value,
                      }))
                    }
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-[#E87519]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                      Email
                    </label>
                    <input
                      type="email"
                      disabled
                      value={currentProfile.email}
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-neutral-50 text-sm text-neutral-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      value={profileForm.phone}
                      onChange={(e) =>
                        setProfileForm((p) => ({ ...p, phone: e.target.value }))
                      }
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-[#E87519]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="bg-[#E87519] hover:bg-[#d56711] text-white px-5 py-2.5 rounded-full text-xs font-bold cursor-pointer"
                >
                  Enregistrer le profil
                </button>
              </form>

              {/* État Supabase / Mock localStorage */}
              <div className="bg-[#FFFEF5] border border-[#F2E8D9]/60 rounded-2xl p-6 space-y-3">
                <div className="flex items-center gap-2.5">
                  <Database className="w-4 h-4 text-[#E87519]" />
                  <h2 className="text-sm font-bold text-[#151515]">
                    Connexion Supabase (Auth + RLS)
                  </h2>
                </div>
                <p className="text-xs text-neutral-600 leading-relaxed">
                  Supabase n'est pas encore connecté sur cet environnement. Les données sont stockées localement dans votre navigateur (clé <span className="font-mono">restos_v6</span>) avec isolation stricte par <span className="font-mono">owner_id</span> et <span className="font-mono">restaurant_id</span>.
                </p>
                <div className="pt-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleResetDemoData}
                    className="px-4 py-2.5 rounded-full border border-neutral-200 hover:border-[#151515] text-xs font-semibold text-[#151515] cursor-pointer"
                  >
                    Réinitialiser les données démo
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="px-4 py-2.5 rounded-full bg-[#151515] text-white text-xs font-semibold cursor-pointer"
                  >
                    Déconnexion
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* BOTTOM TABS MOBILE (5 icônes : Accueil, Menu, Commandes, QR Code, Plus) */}
      <nav
        aria-label="Navigation mobile"
        style={{ background: C.sidebar }}
        className="no-print lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 backdrop-blur-md border-t border-white/10 grid grid-cols-5 items-center"
      >
        {[
          { id: 'dashboard' as View, label: 'Accueil', icon: LayoutDashboard },
          { id: 'menu' as View, label: 'Menu', icon: UtensilsCrossed },
          { id: 'orders' as View, label: 'Commandes', icon: ShoppingBag },
          { id: 'qrcode' as View, label: 'QR Code', icon: QrCode },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = view === tab.id;
          const showBadge = tab.id === 'orders' && newOrdersCount > 0;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setMobileMoreOpen(false);
                navigate(tab.id);
              }}
              className={`relative flex flex-col items-center justify-center h-full cursor-pointer transition-colors ${
                active ? 'text-[#E87519]' : 'text-white/60'
              }`}
            >
              <span className="relative inline-flex">
                <Icon className="w-5 h-5" />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
                    {newOrdersCount}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-semibold mt-1 whitespace-nowrap">
                {tab.label}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMobileMoreOpen(true)}
          className={`flex flex-col items-center justify-center h-full cursor-pointer transition-colors ${
            view === 'restaurant' ||
            view === 'visuals' ||
            view === 'settings' ||
            mobileMoreOpen
              ? 'text-[#E87519]'
              : 'text-white/60'
          }`}
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[10px] font-semibold mt-1 whitespace-nowrap">
            Plus
          </span>
        </button>
      </nav>

      {/* TIROIR MOBILE "PLUS" (Mon restaurant, Visuels WhatsApp, Paramètres, Déconnexion) */}
      {mobileMoreOpen && (
        <div className="no-print lg:hidden fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-[2px]">
          <div
            className="fixed inset-0"
            onClick={() => setMobileMoreOpen(false)}
          />
          <div className="relative w-full bg-[#FFFEF5] border-t border-[#F2E8D9]/60 rounded-t-3xl p-5 pb-8 space-y-2 shadow-xl">
            <div className="w-10 h-1 bg-neutral-200 rounded-full mx-auto mb-3" />
            <p className="text-xs font-bold text-neutral-400 px-2 pb-1">
              Plus d'options
            </p>
            {[
              { id: 'restaurant' as View, label: 'Mon restaurant', icon: Store },
              {
                id: 'visuals' as View,
                label: 'Visuels WhatsApp',
                icon: ImageIcon,
              },
              { id: 'settings' as View, label: 'Paramètres', icon: Settings },
            ].map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setMobileMoreOpen(false);
                    navigate(item.id);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-sm font-semibold cursor-pointer ${
                    active
                      ? 'bg-[#151515] text-white'
                      : 'bg-[#FFFBF7] text-[#151515]'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </span>
                  <ChevronRight className="w-4 h-4 opacity-50" />
                </button>
              );
            })}

            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-semibold text-red-600 bg-red-50 cursor-pointer mt-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Déconnexion</span>
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* MODAL AJOUT / MODIFICATION PLAT                                    */}
      {/* ================================================================== */}
      {dishModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-4">
          <div
            className="fixed inset-0"
            onClick={() => setDishModalOpen(false)}
          />
          <div className="relative w-full sm:max-w-[480px] bg-[#FFFEF5] border border-[#F2E8D9]/60 rounded-t-3xl sm:rounded-3xl p-6 max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-[#151515]">
                {editingDish ? 'Modifier le plat' : 'Ajouter un plat'}
              </h2>
              <button
                type="button"
                onClick={() => setDishModalOpen(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-neutral-500 hover:bg-neutral-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDish} className="space-y-4">
              {/* Photo upload direct téléphone base64 */}
              <div>
                <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                  Photo du plat
                </label>
                <input
                  ref={dishPhotoInputRef}
                  type="file"
                  hidden
                  accept="image/*"
                  capture="environment"
                  onChange={handleDishPhotoUpload}
                />
                <button
                  type="button"
                  onClick={() => dishPhotoInputRef.current?.click()}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border border-dashed border-neutral-300 hover:border-[#E87519] cursor-pointer text-left"
                >
                  {dishForm.photo_url ? (
                    <img
                      src={dishForm.photo_url}
                      alt="Plat"
                      className="w-12 h-12 rounded-xl object-cover shrink-0 border border-neutral-200"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-[#FFFBF7] border border-neutral-200 flex items-center justify-center text-neutral-400 shrink-0">
                      <Camera className="w-5 h-5" />
                    </div>
                  )}
                  <div>
                    <span className="block text-xs font-semibold text-[#151515]">
                      {dishForm.photo_url
                        ? 'Changer la photo'
                        : 'Prendre / choisir une photo'}
                    </span>
                    <span className="block text-[11px] text-neutral-400">
                      Encodage direct base64
                    </span>
                  </div>
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                  Nom du plat *
                </label>
                <input
                  type="text"
                  required
                  value={dishForm.name}
                  onChange={(e) =>
                    setDishForm((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="Ex : Carpe braisée + alloco"
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-[#E87519]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                    Prix (FCFA) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    required
                    value={dishForm.price}
                    onChange={(e) =>
                      setDishForm((p) => ({ ...p, price: e.target.value }))
                    }
                    placeholder="5000"
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-sm tabular-nums focus:outline-none focus:border-[#E87519]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                    Catégorie
                  </label>
                  <select
                    value={dishForm.category_id}
                    onChange={(e) =>
                      setDishForm((p) => ({
                        ...p,
                        category_id: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-[#E87519]"
                  >
                    {myCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={dishForm.description}
                  onChange={(e) =>
                    setDishForm((p) => ({
                      ...p,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Ingrédients ou accompagnement inclus..."
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-[#E87519] resize-none"
                />
              </div>

              {/* Toggles Disponibilité & Plat du jour */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-sm font-medium text-[#151515]">
                  Disponible immédiatement
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={dishForm.is_available}
                  onClick={() =>
                    setDishForm((p) => ({
                      ...p,
                      is_available: !p.is_available,
                    }))
                  }
                  className={`relative inline-flex h-6 w-11 rounded-full transition-colors cursor-pointer ${
                    dishForm.is_available ? 'bg-[#E87519]' : 'bg-neutral-200'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform mt-0.5 ${
                      dishForm.is_available
                        ? 'translate-x-5.5'
                        : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#151515]">
                  Mettre en Plat du jour
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={dishForm.is_daily_special}
                  onClick={() =>
                    setDishForm((p) => ({
                      ...p,
                      is_daily_special: !p.is_daily_special,
                    }))
                  }
                  className={`relative inline-flex h-6 w-11 rounded-full transition-colors cursor-pointer ${
                    dishForm.is_daily_special
                      ? 'bg-[#E87519]'
                      : 'bg-neutral-200'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform mt-0.5 ${
                      dishForm.is_daily_special
                        ? 'translate-x-5.5'
                        : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              <button
                type="submit"
                className="w-full bg-[#E87519] hover:bg-[#d56711] text-white py-3.5 rounded-full font-bold text-sm cursor-pointer mt-2"
              >
                {editingDish ? 'Enregistrer les modifications' : 'Ajouter au menu'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* MODAL DÉTAIL COMMANDE & STATUT / PAIEMENT MANUEL                   */}
      {/* ================================================================== */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-4">
          <div
            className="fixed inset-0"
            onClick={() => setSelectedOrderId(null)}
          />
          <div className="relative w-full sm:max-w-[480px] bg-[#FFFEF5] border border-[#F2E8D9]/60 rounded-t-3xl sm:rounded-3xl p-6 max-h-[92vh] overflow-y-auto shadow-xl space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-sm font-bold text-[#E87519]">
                  {selectedOrder.order_number}
                </p>
                <h2 className="text-lg font-bold text-[#151515] mt-0.5">
                  {selectedOrder.customer_name}
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5 tabular-nums">
                  {selectedOrder.table_label} · {selectedOrder.customer_phone} ·{' '}
                  {formatDateTime(selectedOrder.created_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderId(null)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-neutral-500 hover:bg-neutral-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Articles */}
            <div className="border-t border-b border-neutral-100 py-3 space-y-2">
              {selectedOrder.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-[#151515]">
                    <span className="font-semibold tabular-nums mr-1.5">
                      {item.quantity}×
                    </span>
                    {item.dish_name}
                  </span>
                  <span className="font-semibold text-[#151515] tabular-nums">
                    {formatFCFA(item.quantity * item.unit_price)}
                  </span>
                </div>
              ))}
              <div className="pt-2 border-t border-neutral-100 flex items-center justify-between">
                <span className="text-sm font-bold text-[#151515]">Total</span>
                <span className="text-lg font-bold text-[#E87519] tabular-nums">
                  {formatFCFA(selectedOrder.total)}
                </span>
              </div>
            </div>

            {/* Changer statut dropdown */}
            <div>
              <label className="block text-xs font-semibold text-[#151515] mb-1.5">
                Changer le statut de la commande
              </label>
              <select
                value={selectedOrder.status}
                onChange={(e) =>
                  updateOrderStatus(
                    selectedOrder.id,
                    e.target.value as OrderStatus
                  )
                }
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 text-sm font-medium focus:outline-none focus:border-[#E87519]"
              >
                {ORDER_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            {/* Paiement manuel */}
            <div className="bg-[#FFFBF7] rounded-2xl p-4 border border-neutral-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#151515]">
                  Statut du paiement
                </span>
                <span className="text-xs font-bold text-[#151515]">
                  {isPaymentReceived(selectedOrder.payment_status)
                    ? 'Reçu'
                    : selectedOrder.payment_status}
                </span>
              </div>

              {selectedOrder.payment_status === 'En attente' && (
                <button
                  type="button"
                  onClick={() => confirmPayment(selectedOrder.id)}
                  className="w-full py-3 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmer paiement reçu</span>
                </button>
              )}

              {isPaymentReceived(selectedOrder.payment_status) && (
                <button
                  type="button"
                  onClick={() =>
                    confirmManualPayment(selectedOrder.id, 'Remboursé')
                  }
                  className="w-full py-2.5 rounded-full border border-neutral-300 text-neutral-700 hover:border-[#151515] text-xs font-semibold cursor-pointer"
                >
                  Marquer comme remboursé
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* MODAL SAISIE COMMANDE COMPTOIR                                     */}
      {/* ================================================================== */}
      {createOrderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 p-0 sm:p-4">
          <div
            className="fixed inset-0"
            onClick={() => setCreateOrderModalOpen(false)}
          />
          <div className="relative w-full sm:max-w-[500px] bg-[#FFFEF5] border border-[#F2E8D9]/60 rounded-t-3xl sm:rounded-3xl p-6 max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#151515]">
                Saisir une commande
              </h2>
              <button
                type="button"
                onClick={() => setCreateOrderModalOpen(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-neutral-500 hover:bg-neutral-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCounterOrder} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#151515] mb-1">
                    Nom client *
                  </label>
                  <input
                    type="text"
                    required
                    value={newOrderCustomer}
                    onChange={(e) => setNewOrderCustomer(e.target.value)}
                    placeholder="Ex : Moussa Koné"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-[#E87519]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#151515] mb-1">
                    Table / Type
                  </label>
                  <input
                    type="text"
                    value={newOrderTable}
                    onChange={(e) => setNewOrderTable(e.target.value)}
                    placeholder="Table 3 ou À emporter"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-[#E87519]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#151515] mb-1">
                  Téléphone client
                </label>
                <input
                  type="tel"
                  value={newOrderPhone}
                  onChange={(e) => setNewOrderPhone(e.target.value)}
                  placeholder="+225 07..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:border-[#E87519]"
                />
              </div>

              <div>
                <p className="text-xs font-semibold text-[#151515] mb-2">
                  Sélectionner les plats disponibles
                </p>
                <div className="max-h-52 overflow-y-auto border border-neutral-200 rounded-2xl divide-y divide-neutral-100">
                  {myDishes.filter((d) => d.is_available).length === 0 ? (
                    <p className="p-4 text-xs text-neutral-500 text-center">
                      Aucun plat disponible dans votre menu.
                    </p>
                  ) : (
                    myDishes
                      .filter((d) => d.is_available)
                      .map((dish) => {
                        const qty = newOrderCart[dish.id] || 0;
                        return (
                          <div
                            key={dish.id}
                            className="px-3.5 py-2.5 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[#151515] truncate">
                                {dish.name}
                              </p>
                              <p className="text-[11px] font-bold text-[#E87519] tabular-nums">
                                {formatFCFA(dish.price)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setNewOrderCart((prev) => ({
                                    ...prev,
                                    [dish.id]: Math.max(0, (prev[dish.id] || 0) - 1),
                                  }))
                                }
                                className="w-7 h-7 rounded-full border border-neutral-200 text-xs font-bold cursor-pointer"
                              >
                                -
                              </button>
                              <span className="w-5 text-center text-xs font-bold tabular-nums">
                                {qty}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setNewOrderCart((prev) => ({
                                    ...prev,
                                    [dish.id]: (prev[dish.id] || 0) + 1,
                                  }))
                                }
                                className="w-7 h-7 rounded-full bg-[#151515] text-white text-xs font-bold cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-[#E87519] hover:bg-[#d56711] text-white py-3.5 rounded-full font-bold text-sm cursor-pointer"
              >
                Créer la commande (En attente de paiement)
              </button>
            </form>
          </div>
        </div>
      )}

      {/* INPUT CACHÉ UPLOAD PDF CARTE COMPLÈTE */}
      <input
        ref={pdfInputRef}
        type="file"
        hidden
        accept=".pdf,application/pdf"
        onChange={handleMenuPdfUpload}
      />

      {/* MODAL CHOIX TÉLÉCHARGEMENT PDF (SI PDF UPLOADÉ EXISTANT) */}
      {pdfChoiceModalOpen && currentRestaurant && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div
            className="fixed inset-0"
            onClick={() => setPdfChoiceModalOpen(false)}
          />
          <div className="relative w-full sm:max-w-[420px] bg-[#FFFEF5] border border-[#F2E8D9]/60 rounded-t-3xl sm:rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#151515]">
                Télécharger la carte PDF
              </h2>
              <button
                type="button"
                onClick={() => setPdfChoiceModalOpen(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-neutral-500 hover:bg-neutral-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-neutral-600">
              Une carte PDF personnalisée est enregistrée pour votre restaurant. Choisissez une option :
            </p>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleDownloadUploadedMenuPdf}
                className="w-full py-3.5 px-4 rounded-full bg-[#E87519] hover:bg-[#d56711] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>Utiliser mon PDF uploadé</span>
              </button>
              <button
                type="button"
                onClick={handleGenerateDynamicMenuPdf}
                className="w-full py-3.5 px-4 rounded-full bg-[#151515] hover:bg-neutral-800 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4 text-[#E87519]" />
                <span>Générer automatiquement</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL APERÇU CARTE PDF UPLOADÉE */}
      {pdfPreviewOpen && restoForm.menu_pdf_url && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
          <div
            className="fixed inset-0"
            onClick={() => setPdfPreviewOpen(false)}
          />
          <div className="relative w-full sm:max-w-[720px] bg-[#FFFEF5] border border-[#F2E8D9]/60 rounded-t-3xl sm:rounded-3xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-[#E87519] shrink-0" />
                <h2 className="text-sm font-bold text-[#151515] truncate">
                  {restoForm.menu_pdf_name || 'Carte PDF complète'}
                </h2>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={restoForm.menu_pdf_url}
                  download={restoForm.menu_pdf_name || 'carte-menu.pdf'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 rounded-full bg-[#151515] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Télécharger</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPdfPreviewOpen(false)}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-neutral-500 hover:bg-neutral-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <iframe
              src={restoForm.menu_pdf_url}
              title="Aperçu carte PDF"
              className="w-full h-[65vh] rounded-2xl border border-[#F2E8D9]/60 bg-white"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SOUS-COMPOSANT TOAST DISCRET
// ============================================================================

function ToastBanner({
  toast,
  onClose,
}: {
  toast: { message: string; tone: 'success' | 'error' | 'info' };
  onClose: () => void;
}) {
  return (
    <div className="no-print fixed top-4 right-4 left-4 sm:left-auto sm:w-auto sm:max-w-sm z-50">
      <div
        className={`flex items-center justify-between gap-3 px-4 py-3 rounded-2xl shadow-lg border text-xs font-semibold ${
          toast.tone === 'error'
            ? 'bg-red-600 text-white border-red-700'
            : toast.tone === 'info'
            ? 'bg-[#151515] text-white border-neutral-800'
            : 'bg-[#151515] text-white border-neutral-800'
        }`}
      >
        <span className="flex items-center gap-2">
          {toast.tone === 'success' && (
            <Check className="w-4 h-4 text-[#E87519] shrink-0" />
          )}
          {toast.tone === 'error' && (
            <AlertCircle className="w-4 h-4 text-white shrink-0" />
          )}
          {toast.message}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-white/70 hover:text-white cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
