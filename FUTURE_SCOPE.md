# Trivelia - Future Scope & Security Roadmap

Ten dokument zawiera listę mechanizmów obronnych, zabezpieczeń oraz potencjalnych wektorów ataków, które zostały zidentyfikowane podczas projektowania systemu. Należy je wdrożyć w przyszłości, przed oficjalnym udostępnieniem gry szerokiej publiczności, aby chronić ekonomię gry (punkty, nagrody) i uczciwość rywalizacji (pojedynki).

## 1. Ochrona przed GPS Spoofingiem (Fałszowanie lokalizacji)
**Zagrożenie:** Użytkownicy mogą korzystać z aplikacji typu "Fake GPS", aby zmieniać swoją lokalizację bez wychodzenia z domu i zbierać monety na całym świecie.
**Rozwiązanie:**
- Wykorzystanie flag systemowych we Flutterze (np. flaga `isMocked` w pakiecie `geolocator`), która weryfikuje, czy lokalizacja pochodzi z rzeczywistego sprzętu GPS, czy z systemu deweloperskiego.
- Blokada uczestnictwa w grze, gdy wykryto użycie mockowania lokalizacji.

## 2. Weryfikacja prędkości poruszania się (Anti-Teleport / Speed Limit)
**Zagrożenie:** Zaawansowani oszuści mogą znaleźć inne metody ominięcia blokady Fake GPS. Poruszanie się autem w trakcie gry może być też niebezpieczne dla graczy.
**Rozwiązanie:**
- Implementacja logiki po stronie serwera (Supabase), która analizuje czas i odległość między rozwiązanymi quizami.
- Ustanowienie maksymalnej dozwolonej prędkości poruszania się (np. prędkość pieszego / roweru).
- Automatyczne nakładanie tymczasowych blokad (soft ban) na konta, które pokonują niemożliwe dystanse w krótkim czasie (np. Warszawa -> Kraków w 5 minut).

## 3. Ochrona przed modyfikacją środowiska uruchomieniowego (Root / Jailbreak Detection)
**Zagrożenie:** Urządzenia ze zrootowanym Androidem lub iOS po jailbreaku ułatwiają ingerencję w pamięć urządzenia, omijanie zabezpieczeń GPS oraz instalowanie niedozwolonych modyfikacji gry.
**Rozwiązanie:**
- Wdrożenie pakietów zabezpieczających we Flutterze (np. `safe_device` lub `freerasp`).
- Uniemożliwienie uruchomienia aplikacji lub wyłączenie funkcji zdobywania nagród na urządzeniach z otwartym dostępem do roota.

## 4. Ataki Man-in-the-Middle (MITM) oraz SSL Pinning
**Zagrożenie:** Przechwycenie ruchu sieciowego za pomocą proxy (np. Charles Proxy, Burp Suite) i wysyłanie sztucznie spreparowanych, poprawnych zapytań (np. bezpośrednie wywoływanie RPC `submit_quiz_answer` podając prawidłowy indeks).
**Rozwiązanie:**
- Wdrożenie SSL Pinningu w aplikacji mobilnej. Aplikacja będzie ufać tylko i wyłącznie autoryzowanemu certyfikatowi serwera Supabase. Każda próba modyfikacji lub wglądu w ruch sieciowy zakończy się błędem TLS.

## 5. Niezależność od czasu urządzenia (Time Spoofing)
**Zagrożenie:** Ręczna zmiana godziny i daty w ustawieniach systemu operacyjnego telefonu w celu ominięcia cooldownów, przyspieszenia odnawiania punktów lub wydłużenia czasu na odpowiedź w pojedynku.
**Rozwiązanie:**
- Całkowity brak zaufania do lokalnego czasu telefonu (np. `DateTime.now()`).
- Wszystkie weryfikacje upływu czasu (ważność sesji quizu, wygaśnięcie pojedynku, czas odpowiedzi) opierają się na funkcjach czasowych bazy danych (np. `now()` w PostgreSQL).

## 6. Obfuskacja kodu (Code Obfuscation)
**Zagrożenie:** Inżynieria wsteczna (reverse engineering) aplikacji pobranej ze sklepu, która mogłaby ujawnić logikę gry, klucze API czy sposób działania zabezpieczeń.
**Rozwiązanie:**
- Kompilowanie aplikacji produkcyjnej z użyciem wbudowanej flagi: `flutter build apk --obfuscate --split-debug-info=/<katalog>`. Zmienia to nazwy wszystkich zmiennych, klas i funkcji na trudne do zrozumienia ciągi znaków.

## 7. Limity anty-botowe (Rate Limiting / Cooldowny)
**Zagrożenie:** Nawet przy najlepszych zabezpieczeniach istnieje ryzyko, że ktoś napisze skrypt (bota) do masowego zaliczania quizów w zautomatyzowany sposób.
**Rozwiązanie:**
- Wprowadzenie na poziomie serwera bazy danych limitów interakcji na użytkownika.
- Przykład: Jeden gracz może zdobyć maksymalnie określoną liczbę monet w ciągu 24 godzin. Chroni to globalny budżet nagród i gospodarkę gry w przypadku jednostkowego włamania.
