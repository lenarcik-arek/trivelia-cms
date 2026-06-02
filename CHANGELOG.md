# Changelog - Trivelia CMS

Wszystkie istotne zmiany w projekcie będą odnotowywane w tym pliku.

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
