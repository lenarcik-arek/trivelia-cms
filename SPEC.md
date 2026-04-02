# Trivelia CMS — Specyfikacja techniczna

CMS webowy do zarządzania treścią gry **Trivelia**. Współdzieli instancję Supabase z aplikacją mobilną, korzystając z dedykowanego systemu uprawnień administratorskich (`cms_admins`).

---

## 🛠 Stack technologiczny

| Technologia          | Wersja     | Rola                           |
| -------------------- | ---------- | ------------------------------ |
| **Next.js**          | 16.2.1     | Framework (App Router, Proxy)  |
| **React**            | 19.2.4     | UI (React 19)                  |
| **TypeScript**       | ^5         | Typowanie                      |
| **Tailwind CSS**     | v4         | Stylowanie (nowa generacja)     |
| **shadcn/ui**        | ^1.3.0     | Komponenty UI (Base UI)        |
| **Supabase**         | ^2.100.1   | Backend (Auth, DB, RLS, PostGIS)|
| **@supabase/ssr**    | ^0.9.0     | Integracja Auth z Next.js      |
| **Leaflet**          | ^1.9.4     | Interaktywne mapy i klastry    |
| **Sonner**           | ^1.0.0     | Powiadomienia (Toast)          |
| **Lucide React**     | ^1.7.0     | Ikony                          |

---

## 📂 Struktura projektu (po refaktoryzacji)

```
src/
├── app/
│   ├── layout.tsx              # Root layout (Plus Jakarta Sans, Toaster)
│   ├── proxy.ts                # Next.js 16 Proxy (auth session & redirects)
│   └── dashboard/
│       ├── layout.tsx          # Dashboard layout (Sidebar + Topbar + auth guard)
│       ├── page.tsx            # Dashboard główny (statystyki)
│       ├── quiz-stops/         # Zarządzanie Quiz Stopami (Map + Table)
│       ├── quiz-content/       # Kategorie i Quizy (Zunifikowany widok)
│       └── users/              # Zarządzanie użytkownikami (Placeholder)
├── components/
│   ├── dashboard/              # Sidebar & Topbar (Ujednolicona nawigacja)
│   └── ui/                     # Reusable shadcn/ui components
├── lib/
│   ├── constants.ts            # Stałe (budżet monet, daty, zoom mapy)
│   ├── geo.ts                  # Utils do parsowania PostGIS POINT
│   ├── map-icons.ts            # Definicje ikon markerów Leaflet
│   ├── navigation.ts           # Centralna definicja menu (DRY)
│   └── supabase/               # Konfiguracja klientów (Browser/Server)
└── types/
    └── index.ts                # Wspólne interfejsy i Unie (ActionResult)
```

---

## 🏗 Architektura i Wzorce

### 1. Zarządzanie punktami (Quiz Stops)
- **Mapa:** Wykorzystuje Leaflet z klastrowaniem punktów (`react-leaflet-cluster`).
- **Lokalizacja:** Automatyczne konwertowanie formatów PostGIS `POINT` na `{lat, lng}`.
- **Statusy:** Dynamiczne wyliczanie statusu (Aktywny/Nieaktywny) na podstawie budżetu monet i daty ważności.
- **Filtrowanie:** Zaawansowane filtry po typie (Normal/Premium), kategorii i statusie, zintegrowane z tabelą i mapą.

### 2. Obsługa danych (Server Actions)
- **Optimistic Updates:** Dodawanie i usuwanie elementów (kategorii, pytań, punktów) odbywa się natychmiastowo w UI, bez przeładowania strony (`window.location.reload` usunięte).
- **Typowanie:** Wszystkie akcje zwracają ujednolicony typ `ActionResult<T>`.

### 3. Bezpieczeństwo i Auth
- **Proxy Boundary:** Przeniesienie logiki z `middleware.ts` do `proxy.ts` zgodnie ze standardem Next.js 16.
- **Admin Lock:** Każde logowanie jest weryfikowane z tabelą `cms_admins`. Sesja jest odświeżana automatycznie przy każdym żądaniu.

---

## ✅ Status implementacji

### Zakończone (Marzec/Kwiecień 2026)
- [x] **Refaktoryzacja Globalna:** Wydzieleniu stałych, utilsów i typów. Usunięcie "God Components".
- [x] **CRUD Quiz Stops:** Interaktywna mapa (tryb dodawania), tabela z akcjami, klastrowanie markerów.
- [x] **Baza pytań:** Zarządzanie pytaniami (2-4 odpowiedzi, 1 poprawna), przypisywanie do kategorii.
- [x] **System kategorii:** Zarządzanie pulą kategorii dla punktów "Normal".
- [x] **UI/UX Polish:** Nowy font (Plus Jakarta Sans), Toasty (Sonner), responsywna nawigacja.
- [x] **Build Production:** Pełna zgodność typów TS i pomyślny build Next.js 16.

### W kolejce
- [ ] **Edycja elementów:** Formularz edycji istniejących punktów i pytań.
- [ ] **Zarządzanie użytkownikami:** Lista graczy, ich statystyki (pula monet, rozwiązane quizy).
- [ ] **Powiadomienia:** Możliwość wysyłania ogłoszeń do aplikacji mobilnej.
- [ ] **Deployment:** Produkcyjne hostowanie frontendu i bazy.
