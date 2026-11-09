import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, of, shareReplay, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DataStore } from '../data.store';
import { Tokens } from '../models';

const ACCESS_KEY = 'hermes.access_token';
const REFRESH_KEY = 'hermes.refresh_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly dataStore = inject(DataStore);
  private readonly url = `${environment.apiUrl}/auth`;

  private readonly accessToken = signal<string | null>(localStorage.getItem(ACCESS_KEY));
  readonly isAuthenticated = computed(() => this.accessToken() !== null);

  // Un seul refresh à la fois, partagé entre les requêtes qui reçoivent un 401 en même temps
  private refreshInFlight: Observable<Tokens> | null = null;

  constructor() {
    // Connexion, rafraîchissement ou déconnexion dans un autre onglet
    globalThis.addEventListener?.('storage', (event: StorageEvent) => {
      if (event.key === ACCESS_KEY || event.key === null) {
        this.accessToken.set(localStorage.getItem(ACCESS_KEY));
      }
    });
  }

  get token(): string | null {
    return this.accessToken();
  }

  register(): Observable<{ accountNumber: string }> {
    return this.http.post<{ accountNumber: string }>(`${this.url}/register`, null);
  }

  login(accountNumber: string): Observable<Tokens> {
    return this.http
      .post<Tokens>(`${this.url}/login`, { accountNumber })
      .pipe(tap((t) => this.saveTokens(t)));
  }

  reactivate(accountNumber: string): Observable<Tokens> {
    return this.http
      .post<Tokens>(`${this.url}/reactivate`, { accountNumber })
      .pipe(tap((t) => this.saveTokens(t)));
  }

  /**
   * Échange le refresh token contre une nouvelle paire. L'API remplace le refresh token à chaque
   * appel : si un autre onglet l'a renouvelé juste avant, ses jetons sont repris dans le stockage.
   */
  refresh(): Observable<Tokens> {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) {
      return throwError(() => new Error('Aucun refresh token'));
    }
    this.refreshInFlight ??= this.http
      .post<Tokens>(`${this.url}/refresh`, { refresh_token: refreshToken })
      .pipe(
        tap((t) => this.saveTokens(t)),
        catchError((error: unknown) => {
          const current = this.storedTokens();
          if (current && current.refresh_token !== refreshToken) {
            this.accessToken.set(current.access_token);
            return of(current);
          }
          return throwError(() => error);
        }),
        finalize(() => (this.refreshInFlight = null)),
        shareReplay(1),
      );
    return this.refreshInFlight;
  }

  hasRefreshToken(): boolean {
    return localStorage.getItem(REFRESH_KEY) !== null;
  }

  /**
   * Ferme la session : révocation côté serveur (sans l'attendre), puis oubli des jetons et des
   * données chargées, pour qu'un autre utilisateur ne les voie jamais.
   */
  logout(redirect = true): void {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (refreshToken) {
      this.http
        .post(`${this.url}/logout`, { refresh_token: refreshToken })
        .subscribe({ error: () => undefined });
    }
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    this.accessToken.set(null);
    this.dataStore.clear();
    if (redirect) {
      void this.router.navigate(['/login']);
    }
  }

  private storedTokens(): Tokens | null {
    const access = localStorage.getItem(ACCESS_KEY);
    const refresh = localStorage.getItem(REFRESH_KEY);
    return access && refresh ? { access_token: access, refresh_token: refresh } : null;
  }

  private saveTokens(tokens: Tokens): void {
    localStorage.setItem(ACCESS_KEY, tokens.access_token);
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
    this.accessToken.set(tokens.access_token);
  }
}
