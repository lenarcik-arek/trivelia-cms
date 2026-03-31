# Trivelia CMS — Specyfikacja techniczna

CMS webowy do zarządzania treścią gry **Trivelia**. Współdzieli instancję Supabase z aplikacją mobilną, ale korzysta z oddzielnego systemu kont administratorskich (`cms_admins`).

---

## Stack technologiczny

| Technologia        | Wersja    | Rola                        |
| ------------------ | --------- | --------------------------- |
| Next.js            | 16.2.1    | Framework (App Router, SSR) |
| React              | 19.2.4    | UI                          |
| TypeScript         | ^5        | Typowanie                   |
| Tailwind CSS       | v4        | Stylowanie                  |
| shadcn/ui (base-ui)| ^1.3.0    | Komponenty UI               |
| Supabase           | ^2.100.1  | Backend (Auth, DB, RLS)     |
| @supabase/ssr      | ^0.9.0    | Auth SSR (cookies)          |
| Lucide React       | ^1.7.0    | Ikony                       |

---

## Struktura projektu

```
src/
├── app/
│   ├── layout.tsx              # Root layout (fonty, globals.css)
│   ├── page.tsx                # Root → redirect do /login
│   ├── globals.css             # Tailwind v4 + custom styles
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx        # Strona logowania (email + hasło)
│   └── dashboard/
│       ├── layout.tsx          # Dashboard layout (Sidebar + Topbar + auth guard)
│       ├── page.tsx            # Dashboard główny (statystyki)
│       ├── quiz-stops/
│       │   └── page.tsx        # Zarządzanie Quiz Stopami (placeholder)
│       ├── questions/
│       │   └── page.tsx        # Zarządzanie pytaniami (placeholder)
│       ├── categories/
│       │   └── page.tsx        # Zarządzanie kategoriami (placeholder)
│       └── users/
│           └── page.tsx        # Zarządzanie użytkownikami (placeholder)
├── components/
│   ├── dashboard/
│   │   ├── sidebar.tsx         # Nawigacja boczna (ikony, aktywny link)
│   │   └── topbar.tsx          # Górna belka (email admina, logout)
│   └── ui/                    # shadcn/ui komponenty
│       ├── avatar.tsx
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── dropdown-menu.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── separator.tsx
│       ├── sheet.tsx
│       └── table.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # createBrowserClient (client components)
│   │   └── server.ts           # createServerClient (server components, cookies)
│   └── utils.ts                # cn() helper (clsx + tailwind-merge)
└── middleware.ts               # Auth middleware (ochrona /dashboard/*)
```

---

## Autentykacja

### Przepływ logowania
1. User wchodzi na `/login` → formularz email + hasło
2. `supabase.auth.signInWithPassword()` → Supabase Auth
3. Po autentykacji → walidacja w tabeli `cms_admins` (`SELECT role WHERE email = ?`)
4. Jeśli brak wpisu w `cms_admins` → `signOut()` + komunikat "Brak uprawnień"
5. Jeśli ok → redirect do `/dashboard`

### Middleware (`middleware.ts`)
- **Matcher:** `/dashboard/:path*`, `/login`
- Niezalogowany + `/dashboard/*` → redirect na `/login`
- Zalogowany + `/login` → redirect na `/dashboard`
- Odświeża sesję Supabase przez cookies (SSR)

### Tabela `cms_admins` (Supabase)
```sql
CREATE TABLE public.cms_admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',  -- 'admin' | 'superadmin'
  created_at TIMESTAMPTZ DEFAULT now()
);
```
- RLS włączony
- Policy: authenticated users mogą czytać (potrzebne do login check)

---

## Dashboard

### Layout
- **Sidebar** (lewy panel, 256px): Logo Trivelia, nawigacja z ikonami, link "Ustawienia" na dole
  - Ukrywa się na mobile (`hidden md:flex`)
- **Topbar** (górna belka, 64px): Tytuł "Panel Administracyjny", avatar z inicjałami, dropdown menu (Moje konto, Wyloguj się)
- **Main content**: scrollowalny area z `p-6`
- Ochrona auth: dashboard `layout.tsx` sprawdza `getUser()` + redirect

### Strona główna (`/dashboard`)
4 karty ze statystykami (dane z Supabase):
- **Quiz Stopy** — `count` z tabeli `quiz_stops`
- **Pytania** — placeholder ("—")
- **Gracze** — `count` z tabeli `profiles`
- **Monety w obiegu** — placeholder ("—")

### Sekcje (placeholder pages)
- `/dashboard/quiz-stops` — Zarządzanie Quiz Stopami
- `/dashboard/questions` — Zarządzanie pytaniami
- `/dashboard/categories` — Zarządzanie kategoriami
- `/dashboard/users` — Zarządzanie użytkownikami

---

## Zmienne środowiskowe (`.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=<Supabase project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase anon key>
```

Te same klucze co w aplikacji mobilnej Trivelia.

---

## Status implementacji

### ✅ Zrobione (Faza 1)
- [x] Projekt Next.js 16 + TypeScript + Tailwind v4
- [x] shadcn/ui + komponenty bazowe (Button, Card, Input, Dialog, Table, Avatar, Badge, etc.)
- [x] Klient Supabase (browser + server SSR)
- [x] Strona logowania z walidacją `cms_admins`
- [x] Middleware chroniący trasy `/dashboard/*`
- [x] Dashboard layout (Sidebar + Topbar)
- [x] Strona główna ze statystykami
- [x] Placeholder pages dla sekcji
- [x] Tabela `cms_admins` w Supabase + RLS

### 🔲 Do zrobienia (kolejne fazy)
- [ ] CRUD Quiz Stopów (lista, dodawanie, edycja, usuwanie)
- [ ] CRUD Pytań (z przypisaniem do Quiz Stopów)
- [ ] Zarządzanie kategoriami pytań (historii, sportu, itd. - brak targetowania po płci)
- [ ] Przegląd użytkowników (profile, statystyki)
- [ ] Responsywny sidebar na mobile (Sheet/Drawer)
- [ ] Push na GitHub
