# Trivelia CMS — Technical Specification

Web-based CMS for managing **Trivelia** game content. Shares a Supabase instance with the mobile app using a dedicated admin permission system (`cms_admins`).

---

## 🛠 Technology Stack

| Technology           | Version    | Role                           |
| -------------------- | ---------- | ------------------------------ |
| **Next.js**          | 16.2.1     | Framework (App Router, Proxy)  |
| **React**            | 19.2.4     | UI (React 19)                  |
| **TypeScript**       | ^5         | Typing                         |
| **Tailwind CSS**     | v4         | Styling (Next Generation)      |
| **shadcn/ui**        | ^1.3.0     | UI Components (Base UI)        |
| **Supabase**         | ^2.100.1   | Backend (Auth, DB, RLS, PostGIS)|
| **@supabase/ssr**    | ^0.9.0     | Auth integration with Next.js  |
| **Leaflet**          | ^1.9.4     | Interactive maps and clusters  |
| **Sonner**           | ^1.0.0     | Notifications (Toast)          |
| **Lucide React**     | ^1.7.0     | Icons                          |

---

## 📂 Project Structure (After Refactoring)

```
src/
├── app/
│   ├── layout.tsx              # Root layout (Plus Jakarta Sans, Toaster)
│   ├── proxy.ts                # Next.js 16 Proxy (auth session & redirects)
│   └── dashboard/
│       ├── layout.tsx          # Dashboard layout (Sidebar + Topbar + auth guard)
│       ├── page.tsx            # Main Dashboard (statistics)
│       ├── quiz-stops/         # Quiz Stop Management (Map + Table)
│       ├── quiz-content/       # Categories and Quizzes (Unified view)
│       └── users/              # User Management (Placeholder)
├── components/
│   ├── dashboard/              # Sidebar & Topbar (Unified navigation)
│   └── ui/                     # Reusable shadcn/ui components
├── lib/
│   ├── constants.ts            # Constants (coin budget, dates, map zoom)
│   ├── geo.ts                  # Utils for PostGIS POINT parsing
│   ├── map-icons.ts            # Leaflet marker icon definitions
│   ├── navigation.ts           # Central menu definition (DRY)
│   └── supabase/               # Client configuration (Browser/Server)
└── types/
    └── index.ts                # Common interfaces and Unions (ActionResult)
```

---

## 🏗 Architecture and Patterns

### 1. Point Management (Quiz Stops)
- **Map:** Uses Leaflet with point clustering (`react-leaflet-cluster`).
- **Location:** Automatic conversion of PostGIS `POINT` formats to `{lat, lng}`.
- **Statuses:** Dynamic status calculation (Active/Inactive) based on coin budget and expiration date.
- **Filtering:** Advanced filters by type (Normal/Premium), category, and status, integrated with the table and map.
- **Generation Source:** Each point is marked as `manual` or `auto` and is visible in CMS filters and tables.

### 1a. Automatic Quiz Stop Generation (MVP)
- **Shared Pool:** Auto-generated quiz stops are shared by all users in the area. The system does not create private per-user stops.
- **Trigger:** `get_nearby_quiz_stops` lazily calls `ensure_auto_quiz_stops_near` before returning map markers.
- **RPC Compatibility:** The legacy 3-argument `get_nearby_quiz_stops` overload must be dropped before creating the 4-argument version with optional `movement_bearing_deg`; otherwise PostgREST cannot resolve mobile calls that pass 3 arguments.
- **Marker Visibility:** Nearby, non-expired stops remain visible regardless of coin budget or current question availability. The RPC excludes only stops already played by the current user; reward and category availability are handled when the user opens or starts a stop.
- **Visibility Radius:** Mobile map requests use a 150 m visibility radius. The quiz access radius remains 50 m and is validated by `start_quiz_session`.
- **Density Limits:** The MVP targets up to 3 active stops within the visibility radius and at least 1 stop within the access radius when generation is geometrically possible.
- **Movement Direction:** The RPC accepts optional `movement_bearing_deg`. When provided, new visible stops are preferred in the user movement cone (`bearing +/- 45°`). Without bearing, stops are distributed around the user.
- **Type:** MVP auto-generation creates only `normal` quiz stops.
- **TTL:** Auto-generated quiz stops expire after 6 hours to keep the map clean.
- **Privacy:** User location is used only for the current RPC call and is not stored.
- **Safety Data:** MVP does not use safety/POI layers. This is a test-only limitation. Future production generation must validate candidates against blocked areas such as water, high-speed roads, military areas, airports, strategic infrastructure, rail infrastructure, restricted/private areas, hazardous industrial areas, construction sites, and naturally dangerous terrain when data is available.
- **Performance:** `quiz_stops.location` must have a GiST index for `ST_DWithin` queries. Generation is protected by an advisory transaction lock per map cell to reduce duplicate stop creation under concurrent requests.

### 2. Data Handling (Server Actions)
- **Optimistic Updates:** Adding and removing elements (categories, questions, points) happens instantly in the UI without page reload (`window.location.reload` removed).
- **Typing:** All actions return a unified `ActionResult<T>` type.

### 3. Security and Auth
- **Session Takeover (Mobile):** To prevent simultaneous logins on multiple devices, a "Session Takeover" mechanism is implemented. Upon successful login, the mobile app checks the `active_device_id` in `public.profiles`. If a different device is active, the user is prompted to take over the session. Proceeding will overwrite `active_device_id` and call `supabase.auth.signOut({ scope: 'others' })` to invalidate tokens on the old device.
- **Proxy Boundary:** Moved logic from `middleware.ts` to `proxy.ts` according to Next.js 16 standards.
- **Admin Lock:** Every login is verified against the `cms_admins` table. The session is automatically refreshed with every request.

---

## ✅ Implementation Status

### Completed (March/April 2026)
- [x] **Global Refactoring:** Extracted constants, utils, and types. Removed "God Components".
- [x] **CRUD Quiz Stops:** Interactive map (adding mode), table with actions, marker clustering.
- [x] **Question Base:** Management of questions (2-4 answers, 1 correct), category assignment, and bulk import from `.xls`/`.xlsx` files.
- [x] **Category System:** Management of category pool for "Normal" points.
- [x] **UI/UX Polish:** New font (Plus Jakarta Sans), Toasts (Sonner), responsive navigation.
- [x] **Build Production:** Full TS type compatibility and successful Next.js 16 build.
- [x] **Auto Quiz Stops MVP:** Shared lazy generation of normal quiz stops near users with 150 m visibility, 50 m access, short TTL, and CMS source labeling.

### Backlog
- [ ] **Element Editing:** Edit form for existing points and questions.
- [ ] **User Management:** Player list, statistics (coin pool, solved quizzes).
- [ ] **Notifications:** Ability to send announcements to the mobile app.
- [ ] **Safety-Aware Generation:** Validate auto-generated candidates against map safety/POI data before public rollout.
- [ ] **Deployment:** Production hosting for frontend and database.
