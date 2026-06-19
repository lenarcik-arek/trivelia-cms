# Changelog - Trivelia CMS

Wszystkie istotne zmiany w projekcie będą odnotowywane w tym pliku.

## [Unreleased] - 2026-06-19
### Fixed
- Przywrócono widoczność ręcznych i automatycznych quiz stopów w aplikacji mobilnej: `get_nearby_quiz_stops` nie ukrywa już markerów na podstawie budżetu monet ani globalnej dostępności nieogranych pytań.
- Zabezpieczono migrację RPC przed pozostawieniem starej, 3-parametrowej sygnatury `get_nearby_quiz_stops`.

## [Unreleased] - 2026-06-16
### Added
- Dodano MVP automatycznego generowania wspólnych quiz stopów (`generation_source = auto`) w pobliżu gracza, z promieniem widoczności 150 m, zasięgiem dostępności 50 m, TTL 6h i limitami zagęszczenia.
- Dodano oznaczenie oraz filtr źródła punktu (`Auto`/`Manual`) w widoku Quiz Stopów w CMS.

## [Unreleased] - 2026-06-02
### Added
- Dodano funkcjonalność masowego importu pytań i kategorii z plików Excel (`.xls`, `.xlsx`) bezpośrednio z poziomu widoku "Kategorie i Quizy" w CMS. Pliki są parsowane po stronie klienta za pomocą biblioteki `xlsx`.

## [Unreleased] - 2026-04-09
### Added
- Wdrożenie usprawnionego procesu rozwoju (SDD/Process Improvement).
- Systemowy plik instrukcji `MASTER_INSTRUCTION.md`.
- Workflow `feature_push.md` dla automatyzacji kończenia zadań.
- Inicjalizacja pliku `CHANGELOG.md`.

### Fixed
- Naprawiono błąd w aplikacji mobilnej, powodujący, że poprawne odpowiedzi z CMS były traktowane jako błędne z powodu różnicy w nazewnictwie kluczy JSON (`isCorrect` vs `is_correct`).
