import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, finalize, shareReplay, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Tokens } from '../models';

const ACCESS_KEY = 'hermes.access_token';
const REFRESH_KEY = 'hermes.refresh_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly url = `${environment.apiUrl}/auth`;

  private readonly accessToken = signal<string | null>(localStorage.getItem(ACCESS_KEY));
  readonly isAuthenticated = computed(() => this.accessToken() !== null);

  // Un seul refresh à la fois, partagé entre les requêtes qui reçoivent un 401 en même temps
  private refreshInFlight: Observable<Tokens> | null = null;

  get token(): string | null {
    return this.accessToken();
  }

  register(): Observable<{ accountNumber: string }> {
    return this.http.post<{ accountNumber: string }>(`${this.url}/register`, null);
  }

  login(accountNumber: string): Observable<Tokens> {
    return this.http.post<Tokens>(`${this.url}/login`, { accountNumber }).pipe(tap((t) => this.store(t)));
  }

  reactivate(accountNumber: string): Observable<Tokens> {
    return this.http.post<Tokens>(`${this.url}/reactivate`, { accountNumber }).pipe(tap((t) => this.store(t)));
  }

  refresh(): Observable<Tokens> {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) {
      throw new Error('Aucun refresh token');
    }
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.http
        .post<Tokens>(`${this.url}/refresh`, { refresh_token: refreshToken })
        .pipe(
          tap((t) => this.store(t)),
          finalize(() => (this.refreshInFlight = null)),
          shareReplay(1),
        );
    }
    return this.refreshInFlight;
  }

  hasRefreshToken(): boolean {
    return localStorage.getItem(REFRESH_KEY) !== null;
  }

  logout(redirect = true): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    this.accessToken.set(null);
    if (redirect) {
      this.router.navigate(['/login']);
    }
  }

  private store(tokens: Tokens): void {
    localStorage.setItem(ACCESS_KEY, tokens.access_token);
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
    this.accessToken.set(tokens.access_token);
  }
}
