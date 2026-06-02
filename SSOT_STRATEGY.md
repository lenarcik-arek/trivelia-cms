# 📋 Strategia Single Source of Truth dla Trivelia (App + CMS)

Ten dokument opisuje standard pracy na dwóch projektach jednocześnie przy zachowaniu spójności bazy danych i optymalizacji tokenów.

## 1. Architektura Plików (Physical SSoT)
Główny plik `supabase_schema.sql` znajduje się w katalogu CMS (Backend):
`trivelia-cms/supabase_schema.sql`

Aby aplikacja mobilna zawsze widziała te same zmiany, stosujemy **Symlink**.
**Polecenie do wykonania w terminalu (w folderze trivel_app):**
```bash
ln -sf ../trivelia-cms/supabase_schema.sql supabase_schema.sql
```

## 2. Spójność Kontekstu (Context SSoT)
Zamiast za każdym razem czytać 10KB kodu SQL, Agent AI korzysta z destylacji wiedzy w SPEC.md.

- **Źródło prawdy dla Agenta:** Sekcja `TECHNICAL DATA SCHEMA` w `SPEC.md` obu projektów.
- **Zasada:** Jeśli zmieniasz coś w SQL, MUSISZ zaktualizować sekcję Database w `SPEC.md` obu projektów.

## 3. Optymalizacja Tokenów
- **Destylacja:** W `SPEC.md` trzymamy tylko definicje tabel i RPC.
- **Lazy Loading:** Czytamy plik SQL tylko wtedy, gdy faktycznie edytujemy bazę danych.

## 4. Workflow Zmian (Database Sync)
1. **Edycja:** Modyfikujesz `trivelia-cms/supabase_schema.sql`.
2. **Sync SPEC:** Aktualizujesz sekcję DB w `trivelia-cms/SPEC.md` oraz `trivel_app/SPEC.md`.
3. **Commit:** Wykonujesz atomic commit z flagą `db: update schema`.

---
*Dokument stworzony przez Antigravity dla zapewnienia spójności projektów (Lead: CMS).*
